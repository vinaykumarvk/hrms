import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, SrTimelineEntry } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

export const SR_TIMELINE_PAGE_SIZE = 25;

export type TimelineViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; employeeId: string; items: SrTimelineEntry[]; nextCursor: string | null };

/**
 * Loads the first ledger window from GET /api/v1/sr/employees/{id}/timeline via the injected
 * client (limit + next_cursor cursor paging from PH-04C). Without an explicit employeeId the
 * first employee visible in scope is resolved through the paged employees list.
 */
export async function loadTimelineFirstPage(
  client: HrmsClient,
  employeeId?: string,
  limit: number = SR_TIMELINE_PAGE_SIZE
): Promise<TimelineViewState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "empty" };
    }
    const page = await client.getServiceRegisterTimeline(targetId, { limit });
    return { kind: "ready", employeeId: targetId, items: page.items, nextCursor: page.next_cursor };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

/** Appends the next cursor window to an already-loaded timeline (load-more affordance). */
export async function loadTimelineNextPage(
  client: HrmsClient,
  state: TimelineViewState,
  limit: number = SR_TIMELINE_PAGE_SIZE
): Promise<TimelineViewState> {
  if (state.kind !== "ready" || state.nextCursor === null) {
    return state;
  }
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

export interface ServiceRegisterTimelineProps {
  client: HrmsClient;
  employeeId?: string;
  pageSize?: number;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: TimelineViewState;
}

export function ServiceRegisterTimeline({ client, employeeId, pageSize = SR_TIMELINE_PAGE_SIZE, initialState }: ServiceRegisterTimelineProps) {
  const [state, setState] = useState<TimelineViewState>(initialState ?? { kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadTimelineFirstPage(client, employeeId, pageSize).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, pageSize]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Service Register" detail="Fetching the G12 append-only ledger timeline." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load the Service Register"
        detail={`The timeline request failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty" || state.items.length === 0) {
    return <OperationalState kind="empty" title="No ledger entries" detail="No Service Register events are recorded for this employee." />;
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
        <strong>{state.items.length} events loaded</strong>
      </div>
      <ol className="sr-timeline">
        {state.items.map((item) => (
          <li key={item.id}>
            <span>sequence {item.sequenceNo}</span>
            <strong>{item.eventTypeCode}</strong>
            <small>
              {item.eventDate} · {item.sourceModule} provenance · hash {item.entryHash.slice(0, 8)} · previous {item.previousHash.slice(0, 8)}
            </small>
          </li>
        ))}
      </ol>
      {state.nextCursor !== null ? (
        <button type="button" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Loading more events…" : "Load more events"}
        </button>
      ) : (
        <p className="record-note">End of ledger — every page of this timeline is loaded.</p>
      )}
      <p className="record-note">
        No edit or delete affordance is exposed; the timeline is append-only (corrections arrive as reversal or corrigendum entries).
      </p>
    </section>
  );
}
