import { useEffect, useState } from "react";
import { HrmsClient, LeaveSrRelaySliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type LeaveSrRelayViewState = SliceViewState<LeaveSrRelaySliceSummary>;

export function loadLeaveSrRelayView(client: HrmsClient): Promise<LeaveSrRelayViewState> {
  return loadSliceView(
    () => client.getLeaveSrRelaySlice(),
    (slice) => slice.total === 0
  );
}

export interface LeaveSrRelayWorkspaceProps {
  client: HrmsClient;
  initialState?: LeaveSrRelayViewState;
}

export function LeaveSrRelayWorkspace({ client, initialState }: LeaveSrRelayWorkspaceProps) {
  const [state, setState] = useState<LeaveSrRelayViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadLeaveSrRelayView(client).then((next) => {
      if (mounted) setState(next);
    });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Leave-SR Relay" detail="Fetching G04 reconciliation report." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Leave-SR Relay" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No relay entries" detail="The G04 outbox has no leave events to reconcile." />;
  }

  const slice = state.slice;
  const deadLetterRate = slice.total > 0 ? (slice.deadLettered / slice.total * 100) : 0;

  return (
    <article className="record-panel" aria-label="G04 leave service register relay">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G04 Relay</p>
          <h2>Leave to Service Register</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {slice.relayOwner}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Total Events" value={slice.total} />
        <SummaryStat label="Posted" value={slice.posted} />
        <SummaryStat
          label="DLQ"
          value={
            slice.deadLettered > 0 ? (
              <span className="text-amber-600">{slice.deadLettered}</span>
            ) : slice.deadLettered
          }
        />
        <SummaryStat label="Discarded" value={slice.discarded} />
      </StatGrid>

      {/* Progress bar */}
      {slice.total > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Relay progress</span>
            <span>{slice.posted} of {slice.total} ({Math.round(slice.posted / slice.total * 100)}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
              style={{ width: `${(slice.posted / slice.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {deadLetterRate > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {slice.deadLettered} event{slice.deadLettered !== 1 ? "s" : ""} dead-lettered ({deadLetterRate.toFixed(1)}%).
          Replay and discard require custodian action. G12 append is idempotent by source reference.
        </p>
      )}

      {deadLetterRate === 0 && slice.total > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          All events posted successfully. G12 append is idempotent by source reference.
        </p>
      )}
    </article>
  );
}
