import { useEffect, useMemo, useState } from "react";
import { HrmsApiError, HrmsClient, SrTimelineEntry } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";

export const SR_TIMELINE_PAGE_SIZE = 25;

export type TimelineViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; employeeId: string; items: SrTimelineEntry[]; nextCursor: string | null };

/* ── Loader ────────────────────────────────────────────────── */

export async function loadTimelineFirstPage(
  client: HrmsClient,
  employeeId?: string,
  limit = SR_TIMELINE_PAGE_SIZE,
): Promise<TimelineViewState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) return { kind: "empty" };
    const page = await client.getServiceRegisterTimeline(targetId, { limit });
    return { kind: "ready", employeeId: targetId, items: page.items, nextCursor: page.next_cursor };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

export async function loadTimelineNextPage(
  client: HrmsClient,
  state: TimelineViewState,
  limit = SR_TIMELINE_PAGE_SIZE,
): Promise<TimelineViewState> {
  if (state.kind !== "ready" || state.nextCursor === null) return state;
  try {
    const page = await client.getServiceRegisterTimeline(state.employeeId, { limit, cursor: state.nextCursor });
    return {
      kind: "ready",
      employeeId: state.employeeId,
      items: [...state.items, ...page.items],
      nextCursor: page.next_cursor,
    };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

/* ── Columns ───────────────────────────────────────────────── */

type TimelineColumn = "sequence" | "eventType" | "eventDate" | "source" | "hash";

const TIMELINE_COLUMNS: DataTableColumnDef<SrTimelineEntry, TimelineColumn>[] = [
  {
    id: "sequence",
    header: "Seq",
    sortable: true,
    resolve: (e) => <span className="tabular-nums font-medium">{e.sequenceNo}</span>,
    sortValue: (e) => e.sequenceNo,
    className: "text-center",
  },
  {
    id: "eventType",
    header: "Event",
    sortable: true,
    resolve: (e) => (
      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
        {e.eventTypeCode}
      </span>
    ),
    sortValue: (e) => e.eventTypeCode,
    filterValue: (e) => e.eventTypeCode,
  },
  {
    id: "eventDate",
    header: "Date",
    sortable: true,
    resolve: (e) => <span className="text-xs tabular-nums">{e.eventDate}</span>,
    sortValue: (e) => e.eventDate,
  },
  {
    id: "source",
    header: "Source",
    resolve: (e) => (
      <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
        {e.sourceModule}
      </span>
    ),
    sortValue: (e) => e.sourceModule,
    filterValue: (e) => e.sourceModule,
  },
  {
    id: "hash",
    header: "Hash Chain",
    resolve: (e) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] text-gray-500">
          entry {e.entryHash.slice(0, 12)}
        </span>
        <span className="font-mono text-[10px] text-gray-400">
          prev {e.previousHash.slice(0, 12)}
        </span>
      </div>
    ),
  },
];

const FILTER_COLS = [
  { id: "eventType", label: "Event", type: "text" as const },
  { id: "source", label: "Source", type: "text" as const },
];

/* ── Component ─────────────────────────────────────────────── */

export interface ServiceRegisterTimelineProps {
  client: HrmsClient;
  employeeId?: string;
  pageSize?: number;
  initialState?: TimelineViewState;
}

export function ServiceRegisterTimeline({
  client,
  employeeId,
  pageSize = SR_TIMELINE_PAGE_SIZE,
  initialState,
}: ServiceRegisterTimelineProps) {
  const [state, setState] = useState<TimelineViewState>(initialState ?? { kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [tableState, tableCallbacks] = useDataTable<TimelineColumn>(pageSize);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadTimelineFirstPage(client, employeeId, pageSize).then((next) => {
      if (mounted) setState(next);
    });
    return () => { mounted = false };
  }, [client, employeeId, pageSize]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Service Register" detail="Fetching the G12 append-only ledger." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Service Register" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty" || state.items.length === 0) {
    return <OperationalState kind="empty" title="No ledger entries" detail="No Service Register events recorded for this employee." />;
  }

  const handleLoadMore = () => {
    setLoadingMore(true);
    void loadTimelineNextPage(client, state, pageSize).then((next) => {
      setState(next);
      setLoadingMore(false);
    });
  };

  return (
    <section className="record-panel" id="service-register" aria-label="Service Register timeline">
      <div className="panel-heading">
        <div>
          <h2>Service Register</h2>
          <p>G12 append-only sequence, hash chain, and provenance view.</p>
        </div>
        <span className="text-xs text-gray-500">{state.items.length} events loaded</span>
      </div>

      <DataTable
        items={state.items}
        columns={TIMELINE_COLUMNS}
        state={tableState}
        callbacks={tableCallbacks}
        filterColumns={FILTER_COLS}
        emptyMessage="No ledger entries."
      />

      {state.nextCursor !== null && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more events"}
          </button>
        </div>
      )}
      {state.nextCursor === null && (
        <p className="mt-2 text-center text-xs text-gray-400">
          End of ledger — all pages loaded (append-only, corrections via corrigendum entries).
        </p>
      )}
    </section>
  );
}
