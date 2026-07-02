import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, LeaveApplicationRecord, LeaveBalanceView } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee self-service summary. */
type SummaryState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; balance: LeaveBalanceView }
  | { kind: "ready"; balance: LeaveBalanceView; applications: LeaveApplicationRecord[] };

const RECENT_LIMIT = 5;

async function loadSelfServiceSummary(client: HrmsClient, employeeId?: string): Promise<SummaryState> {
  try {
    const [balance, applications] = await Promise.all([client.getLeaveBalance(employeeId), client.listLeaveApplications()]);
    const own = employeeId ? applications.items.filter((application) => application.employeeId === employeeId) : applications.items;
    const recent = own.slice(0, RECENT_LIMIT);
    return recent.length === 0 ? { kind: "empty", balance } : { kind: "ready", balance, applications: recent };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface SelfServiceSummaryProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * PH-07E G03 employee self-service summary: fetches the live leave balance
 * (GET /api/v1/atl/leave-balances) and the employee's recent leave applications
 * (GET /api/v1/atl/leave-applications) through the injected client — no precomputed slice props.
 */
export function SelfServiceSummary({ client, employeeId }: SelfServiceSummaryProps) {
  const [state, setState] = useState<SummaryState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadSelfServiceSummary(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading self-service summary" detail="Fetching your leave balance and recent applications." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load self-service summary"
        detail={`The self-service fetch failed with error code ${state.errorCode}.`}
      />
    );
  }

  const balance = state.balance;
  return (
    <section className="record-panel g03-self-service-panel" aria-label="G03 employee self-service summary">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Self-Service</p>
          <h2>My Leave Summary</h2>
        </div>
        <strong>{balance.leaveTypeId}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Leave year</dt>
          <dd>{balance.leaveYear}</dd>
        </div>
        <div>
          <dt>Current balance</dt>
          <dd>{balance.currentBalance}</dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>{balance.reserved}</dd>
        </div>
        <div>
          <dt>Debited</dt>
          <dd>{balance.debited}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{balance.availableBalance}</dd>
        </div>
      </dl>
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No applications" detail="You have not applied for leave yet this year." />
      ) : (
        <ul className="self-service-applications" aria-label="My recent leave applications">
          {state.applications.map((application) => (
            <li key={application.id}>
              <strong>{application.applicationNo}</strong> — {application.leaveTypeId} {application.fromDate} to {application.toDate} (
              {application.totalDays} days): {application.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
