import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

export const g03RouteEvidence = {
  leaveApplications: "/api/v1/atl/leave-applications",
  leaveDecision: "/api/v1/atl/leave-applications/{id}/decision",
  leaveBalances: "/api/v1/atl/leave-balances",
  g04Outbox: "/api/v1/atl/leave-sr-outbox",
  attendanceCaptures: "/api/v1/atl/attendance-captures",
  payrollSignals: "/api/v1/atl/payroll-signals",
  resolver: "REPORTING_CHAIN",
  delegation: "P01 DELEGATE",
};

export function registerG03Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/atl/leave-applications",
      operationId: "g03.submitLeaveApplication",
      protected: true,
      permission: "g03.leave.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.leave.submit(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            leaveTypeId: optionalString(body, "leaveTypeId") ?? "EL",
            fromDate: requiredString(body, "fromDate"),
            toDate: requiredString(body, "toDate"),
            reason: optionalString(body, "reason"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/leave-applications",
      operationId: "g03.listLeaveApplications",
      protected: true,
      permission: "g03.leave.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const applications = context.services.leave.listApplications(context.scope);
        return ok({ items: applications.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/leave-applications/{id}/decision",
      operationId: "g03.decideLeaveApplication",
      protected: true,
      permission: "g03.leave.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        const decision = requiredString(body, "decision");
        const leaveApplicationId = requiredParam(context.params, "id");
        const expectedVersion = optionalNumber(body, "expectedVersion");
        if (decision === "APPROVE") {
          return accepted(context.services.leave.approve(context.actor, leaveApplicationId, requiredString({ key: context.idempotencyKey }, "key"), expectedVersion));
        }
        if (decision === "REJECT") {
          return accepted(context.services.leave.reject(context.actor, leaveApplicationId));
        }
        if (decision === "DELEGATE") {
          return accepted(context.services.leave.delegate(context.actor, leaveApplicationId, requiredString(body, "delegateEmployeeId")));
        }
        if (decision === "CANCEL") {
          return accepted(
            context.services.leave.cancelApproved(
              context.actor,
              leaveApplicationId,
              requiredString({ key: context.idempotencyKey }, "key"),
              optionalString(body, "cancelDate") ?? "2026-07-02",
              expectedVersion
            )
          );
        }
        return accepted(context.services.leave.approve(context.actor, leaveApplicationId, requiredString({ key: context.idempotencyKey }, "key"), expectedVersion));
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/leave-applications/{id}:withdraw",
      operationId: "g03.withdrawLeaveApplication",
      protected: true,
      permission: "g03.leave.withdraw",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body ?? {});
        return accepted(
          context.services.leave.withdraw(context.actor, requiredParam(context.params, "id"), optionalNumber(body, "expectedVersion"))
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/leave-applications/{id}:cancel-partial",
      operationId: "g03.partialCancelLeaveApplication",
      protected: true,
      permission: "g03.leave.cancel",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.leave.cancelApprovedPartial(context.actor, requiredParam(context.params, "id"), requiredString({ key: context.idempotencyKey }, "key"), {
            cancelFromDate: requiredString(body, "cancelFromDate"),
            expectedVersion: optionalNumber(body, "expectedVersion"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/leave-types",
      operationId: "g03.configureLeaveType",
      protected: true,
      permission: "g03.leave.configure",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          leaveType: context.services.leave.configureLeaveType(context.actor, {
            leaveTypeId: requiredString(body, "leaveTypeId"),
            name: requiredString(body, "name"),
            countsHolidays: optionalBoolean(body, "countsHolidays") ?? true,
            openingBalance: optionalNumber(body, "openingBalance") ?? 0,
            accrualPolicy: {
              frequency: (optionalString(body, "accrualFrequency") ?? "YEARLY") as "MONTHLY" | "HALF_YEARLY" | "YEARLY",
              unitsPerPeriod: optionalNumber(body, "accrualUnitsPerPeriod") ?? 0,
            },
            eligibility: optionalNumber(body, "minServiceMonths") !== undefined ? { minServiceMonths: optionalNumber(body, "minServiceMonths") as number } : undefined,
            entitlementCapDays: optionalNumber(body, "entitlementCapDays"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/leave-types",
      operationId: "g03.listLeaveTypes",
      protected: true,
      permission: "g03.leave.read",
      handler: (context) => ok({ items: context.services.leave.listLeaveTypes(context.scope), limit: 25, next_cursor: null }),
    },
    {
      method: "POST",
      path: "/api/v1/atl/holidays",
      operationId: "g03.addHoliday",
      protected: true,
      permission: "g03.holiday.configure",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          holiday: context.services.leave.addHoliday(context.actor, {
            holidayDate: requiredString(body, "holidayDate"),
            name: requiredString(body, "name"),
            calendarId: optionalString(body, "calendarId"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/holidays",
      operationId: "g03.listHolidays",
      protected: true,
      permission: "g03.leave.read",
      handler: (context) => ok({ items: context.services.leave.listHolidays(context.scope), limit: 25, next_cursor: null }),
    },
    {
      method: "GET",
      path: "/api/v1/atl/leave-balances",
      operationId: "g03.getLeaveBalance",
      protected: true,
      permission: "g03.leave.read",
      handler: (context) => {
        const employeeId = optionalString(context.request.query ?? {}, "employeeId") ?? ph03Ids.employee;
        const leaveTypeId = optionalString(context.request.query ?? {}, "leaveTypeId") ?? "EL";
        return ok({ balance: context.services.leave.getBalance(context.scope, employeeId, leaveTypeId) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/leave-sr-outbox",
      operationId: "g03.listLeaveServiceRegisterOutbox",
      protected: true,
      permission: "g03.leave.read",
      handler: (context) => ok({ items: context.services.leave.listOutbox(context.scope), limit: 25, next_cursor: null }),
    },
    {
      method: "POST",
      path: "/api/v1/atl/leave-accruals",
      operationId: "g03.createLeaveAccrual",
      protected: true,
      permission: "g03.leave.accrue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          balance: context.services.leave.accrue(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            leaveTypeId: optionalString(body, "leaveTypeId") ?? "EL",
            leaveYear: Number.parseInt(optionalString(body, "leaveYear") ?? "2026", 10),
            units: Number.parseFloat(optionalString(body, "units") ?? "1"),
            effectiveDate: optionalString(body, "effectiveDate") ?? "2026-07-02",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/attendance-captures",
      operationId: "g03.captureAttendance",
      protected: true,
      permission: "g03.attendance.capture",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          attendance: context.services.leave.captureAttendance(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            attendanceDate: requiredString(body, "attendanceDate"),
            inTime: optionalString(body, "inTime"),
            outTime: optionalString(body, "outTime"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/attendance-captures/{id}:regularise",
      operationId: "g03.regulariseAttendance",
      protected: true,
      permission: "g03.attendance.regularise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.leave.regulariseAttendance(context.actor, requiredParam(context.params, "id"), requiredString(body, "reason"), optionalString(body, "asOfDate"))
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/overtime",
      operationId: "g03.recordOvertime",
      protected: true,
      permission: "g03.overtime.record",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          signal: context.services.leave.recordOvertime(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            attendanceDate: requiredString(body, "attendanceDate"),
            minutes: Number.parseInt(optionalString(body, "minutes") ?? "60", 10),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/payroll-signals",
      operationId: "g03.listPayrollSignals",
      protected: true,
      permission: "g03.payroll.signal.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const signals = context.services.leave.listPayrollSignals(context.scope);
        return ok({ items: signals.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/payroll-feed:generate",
      operationId: "g03.generatePayrollFeed",
      protected: true,
      permission: "g03.payroll.feed.generate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ items: context.services.leave.generatePayrollFeed(context.actor, requiredString(body, "payPeriod")) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/atl/payroll-feed:lock",
      operationId: "g03.lockPayrollFeedPeriod",
      protected: true,
      permission: "g03.payroll.feed.lock",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(context.services.leave.lockPayrollFeedPeriod(context.actor, requiredString(body, "payPeriod")));
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/payroll-feed",
      operationId: "g03.listPayrollFeed",
      protected: true,
      permission: "g03.payroll.feed.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const payPeriod = optionalString(context.request.query ?? {}, "payPeriod");
        const rows = context.services.leave.listPayrollFeed(context.scope, payPeriod);
        return ok({ items: rows.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "GET",
      path: "/api/v1/atl/payroll-feed-adjustments",
      operationId: "g03.listPayrollFeedAdjustments",
      protected: true,
      permission: "g03.payroll.feed.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const adjustments = context.services.leave.listPayrollFeedAdjustments(context.scope);
        return ok({ items: adjustments.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
