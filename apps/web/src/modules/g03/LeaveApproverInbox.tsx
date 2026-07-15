import { useEffect, useMemo, useState } from "react";
import { HrmsApiError, HrmsClient, LeaveApplicationRecord, LeaveDecisionVerb } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";

/* ── Types ─────────────────────────────────────────────────── */

type InboxState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; applications: LeaveApplicationRecord[] };

export interface LeaveApproverInboxProps {
  client: HrmsClient;
  refreshToken: number;
  onDecided: () => void;
}

/* ── Row Actions ───────────────────────────────────────────── */

function InboxRowActions({
  application,
  client,
  onDecided,
}: {
  application: LeaveApplicationRecord;
  client: HrmsClient;
  onDecided: () => void;
}) {
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function decide(decision: LeaveDecisionVerb) {
    setDeciding(true);
    setError(null);
    void client
      .decideLeaveApplication(application.id, decision, crypto.randomUUID())
      .then(() => {
        setDeciding(false);
        onDecided();
      })
      .catch((err: unknown) => {
        setDeciding(false);
        setError(err instanceof HrmsApiError ? err.code : "UNKNOWN_ERROR");
      });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          onClick={() => decide("APPROVE")}
          disabled={deciding}
          className="rounded bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {deciding ? "…" : "Approve"}
        </button>
        <button
          onClick={() => decide("REJECT")}
          disabled={deciding}
          className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}

/* ── Columns ───────────────────────────────────────────────── */

type InboxColumn = "applicationNo" | "employeeId" | "leaveType" | "dates" | "days" | "actions";

function createColumns(
  client: HrmsClient,
  onDecided: () => void
): DataTableColumnDef<LeaveApplicationRecord, InboxColumn>[] {
  return [
    {
      id: "applicationNo",
      header: "Application",
      sortable: true,
      resolve: (a) => <span className="font-medium tabular-nums">{a.applicationNo}</span>,
      sortValue: (a) => a.applicationNo,
      filterValue: (a) => a.applicationNo,
    },
    {
      id: "employeeId",
      header: "Employee",
      sortable: true,
      resolve: (a) => a.employeeId,
      sortValue: (a) => a.employeeId,
      filterValue: (a) => a.employeeId,
    },
    {
      id: "leaveType",
      header: "Leave Type",
      sortable: true,
      resolve: (a) => (
        <span className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-blue-700">
          {a.leaveTypeId}
        </span>
      ),
      sortValue: (a) => a.leaveTypeId,
      filterValue: (a) => a.leaveTypeId,
    },
    {
      id: "dates",
      header: "Dates",
      resolve: (a) => (
        <span className="text-xs">
          {a.fromDate} → {a.toDate}
        </span>
      ),
      sortValue: (a) => a.fromDate,
      filterValue: (a) => `${a.fromDate} ${a.toDate}`,
    },
    {
      id: "days",
      header: "Days",
      resolve: (a) => <span className="tabular-nums">{a.totalDays}</span>,
      sortValue: (a) => a.totalDays,
      className: "text-center",
    },
    {
      id: "actions",
      header: "Action",
      resolve: (a) => <InboxRowActions application={a} client={client} onDecided={onDecided} />,
    },
  ];
}

const FILTER_COLS = [
  { id: "applicationNo", label: "Application", type: "text" as const },
  { id: "employeeId", label: "Employee", type: "text" as const },
  { id: "leaveType", label: "Leave Type", type: "text" as const },
];

/* ── Component ─────────────────────────────────────────────── */

export function LeaveApproverInbox({ client, refreshToken, onDecided }: LeaveApproverInboxProps) {
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const [tableState, tableCallbacks] = useDataTable<InboxColumn>(10);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .listLeaveApplications()
      .then((result) => {
        if (!mounted) return;
        const pending = result.items.filter((a) => a.status === "SUBMITTED");
        setState(pending.length === 0 ? { kind: "empty" } : { kind: "ready", applications: pending });
      })
      .catch((error: unknown) => {
        if (mounted) setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" });
      });
    return () => { mounted = false };
  }, [client, refreshToken]);

  const columns = useMemo(() => createColumns(client, onDecided), [client, onDecided]);

  return (
    <section className="record-panel leave-approver-panel" aria-label="G03 approver inbox">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Leave</p>
          <h2>Approver Inbox</h2>
        </div>
        {state.kind === "ready" && (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {state.applications.length} pending
          </span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading inbox" detail="Fetching SUBMITTED leave applications." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load inbox" detail={`Error code ${state.errorCode}.`} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No applications" detail="No leave applications waiting for a decision." />
      ) : (
        <DataTable
          items={state.applications}
          columns={columns}
          state={tableState}
          callbacks={tableCallbacks}
          filterColumns={FILTER_COLS}
          emptyMessage="No pending applications."
          filteredEmptyMessage="No applications match the current filters."
        />
      )}
    </section>
  );
}
