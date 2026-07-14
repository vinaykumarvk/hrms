import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PersonalDashboardView } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my personal dashboard". */
type MyDashboardState = { kind: "loading" } | { kind: "error"; errorCode: string } | { kind: "ready"; dashboard: PersonalDashboardView };

async function loadMyDashboard(client: HrmsClient, employeeId: string): Promise<MyDashboardState> {
  try {
    const { dashboard } = await client.getMyDashboard(employeeId);
    return { kind: "ready", dashboard };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyDashboardPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-dashboard-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G14 self-service: "own personal dashboard" — a thin read of the employee's own leave balance
 * (GET /api/v1/atl/leave-balances) and attendance summary, composed server-side into a single
 * GET /api/v1/analytics/employees/{id}/dashboard call. Reuses existing G03 data directly; does
 * not touch the KPI/mart/datamart engine the rest of G14 runs on.
 */
export function MyDashboardPanel({ client, employeeId, refreshToken }: MyDashboardPanelProps) {
  const [state, setState] = useState<MyDashboardState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyDashboard(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  return (
    <section className="record-panel g14-my-dashboard-panel" aria-label="G14 my dashboard">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G14 My Dashboard</p>
          <h2>My Personal Dashboard</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my dashboard" detail="Fetching your leave balance and attendance summary." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my dashboard" detail={`The request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" ? (
        <dl aria-label="My dashboard summary">
          <div>
            <dt>Leave balance ({state.dashboard.leaveBalance.leaveTypeId})</dt>
            <dd>
              {state.dashboard.leaveBalance.availableBalance} days available of {state.dashboard.leaveBalance.currentBalance} (year{" "}
              {state.dashboard.leaveBalance.leaveYear})
            </dd>
          </div>
          <div>
            <dt>Attendance summary</dt>
            <dd>
              {state.dashboard.attendanceSummary.presentDays} present of {state.dashboard.attendanceSummary.totalRecords} recorded days (
              {state.dashboard.attendanceSummary.regularisedDays} regularised)
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
