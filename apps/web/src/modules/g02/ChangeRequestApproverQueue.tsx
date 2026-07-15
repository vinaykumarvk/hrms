import { useEffect, useMemo, useState } from "react";
import { HrmsApiError, HrmsClient, PersonalDetailChangeRecord, PersonalDetailDecisionVerb } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";
import { ChangeRequestDiffView } from "./ChangeRequestDiffView";

/* ── Types ─────────────────────────────────────────────────── */

type QueueState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; requests: PersonalDetailChangeRecord[] };

export interface ChangeRequestApproverQueueProps {
  client: HrmsClient;
  refreshToken: number;
  onDecided: () => void;
}

/* ── Columns ───────────────────────────────────────────────── */

type QueueColumn = "requestNo" | "fieldCode" | "employeeId" | "sensitivity" | "revision" | "actions";

function ApproverRowActions({
  request,
  client,
  onDecided,
}: {
  request: PersonalDetailChangeRecord;
  client: HrmsClient;
  onDecided: () => void;
}) {
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState(false);

  function decide(verb: PersonalDetailDecisionVerb) {
    const trimmed = comment.trim();
    if ((verb === "reject" || verb === "send-back") && !trimmed) {
      setError("ERR-REASON-REQ: comment required");
      return;
    }
    setDeciding(true);
    setError(null);
    void client
      .decidePersonalDetailChangeRequest(request.id, verb, trimmed || undefined, crypto.randomUUID())
      .then(() => {
        setDeciding(false);
        onDecided();
      })
      .catch((err: unknown) => {
        setDeciding(false);
        setError(err instanceof HrmsApiError ? err.displayCode : "UNKNOWN_ERROR");
      });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        placeholder="Comment (required for reject/send-back)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => decide("approve")}
          disabled={deciding}
          className="rounded bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide("reject")}
          disabled={deciding}
          className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={() => decide("send-back")}
          disabled={deciding}
          className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Send back
        </button>
        <button
          onClick={() => setOpenDiff((v) => !v)}
          className="rounded border px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
        >
          {openDiff ? "Hide diff" : "View diff"}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      {openDiff && <ChangeRequestDiffView client={client} requestId={request.id} />}
    </div>
  );
}

function createApproverColumns(
  client: HrmsClient,
  onDecided: () => void
): DataTableColumnDef<PersonalDetailChangeRecord, QueueColumn>[] {
  return [
    {
      id: "requestNo",
      header: "Request",
      sortable: true,
      resolve: (r) => <span className="font-medium tabular-nums">{r.requestNo}</span>,
      sortValue: (r) => r.requestNo,
      filterValue: (r) => r.requestNo,
    },
    {
      id: "fieldCode",
      header: "Field",
      sortable: true,
      resolve: (r) => (
        <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
          {r.fieldCode}
        </span>
      ),
      sortValue: (r) => r.fieldCode,
      filterValue: (r) => r.fieldCode,
    },
    {
      id: "employeeId",
      header: "Employee",
      resolve: (r) => r.employeeId,
      sortValue: (r) => r.employeeId,
      filterValue: (r) => r.employeeId,
    },
    {
      id: "sensitivity",
      header: "Sensitivity",
      resolve: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
            r.sensitivity === "HIGH" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700"
          }`}
        >
          {r.sensitivity}
        </span>
      ),
      sortValue: (r) => r.sensitivity,
      filterValue: (r) => r.sensitivity,
    },
    {
      id: "revision",
      header: "Rev",
      resolve: (r) => <span className="tabular-nums">{r.revisionNo}</span>,
      sortValue: (r) => r.revisionNo,
      className: "text-center",
    },
    {
      id: "actions",
      header: "Action",
      resolve: (r) => <ApproverRowActions request={r} client={client} onDecided={onDecided} />,
    },
  ];
}

const FILTER_COLS = [
  { id: "requestNo", label: "Request", type: "text" as const },
  { id: "fieldCode", label: "Field", type: "text" as const },
  { id: "sensitivity", label: "Sensitivity", type: "text" as const },
];

/* ── Component ─────────────────────────────────────────────── */

export function ChangeRequestApproverQueue({
  client,
  refreshToken,
  onDecided,
}: ChangeRequestApproverQueueProps) {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [tableState, tableCallbacks] = useDataTable<QueueColumn>(10);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .listPersonalDetailChangeRequests()
      .then((result) => {
        if (!mounted) return;
        const pending = result.items.filter((r) => r.status === "IN_REVIEW");
        setState(pending.length === 0 ? { kind: "empty" } : { kind: "ready", requests: pending });
      })
      .catch((error: unknown) => {
        if (mounted) setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
    return () => { mounted = false };
  }, [client, refreshToken]);

  const columns = useMemo(() => createApproverColumns(client, onDecided), [client, onDecided]);

  return (
    <section className="record-panel g02-approver-queue" aria-label="G02 approver queue">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>Approver Queue</h2>
        </div>
        {state.kind === "ready" && (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {state.requests.length} pending
          </span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading queue" detail="Fetching IN_REVIEW change requests." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load queue" detail={`Error code ${state.errorCode}.`} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No pending requests" detail="No change requests waiting for a decision." />
      ) : (
        <DataTable
          items={state.requests}
          columns={columns}
          state={tableState}
          callbacks={tableCallbacks}
          filterColumns={FILTER_COLS}
          emptyMessage="No pending requests."
          filteredEmptyMessage="No requests match the current filters."
        />
      )}
    </section>
  );
}
