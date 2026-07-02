import { useEffect, useState } from "react";
import { HrmsClient, LeaveSrRelaySliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type LeaveSrRelayViewState = SliceViewState<LeaveSrRelaySliceSummary>;

/** Loads the G04 relay reconciliation report from GET /api/v1/leave-sr/reconciliation via the injected client. */
export function loadLeaveSrRelayView(client: HrmsClient): Promise<LeaveSrRelayViewState> {
  return loadSliceView(
    () => client.getLeaveSrRelaySlice(),
    (slice) => slice.total === 0
  );
}

export interface LeaveSrRelayWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: LeaveSrRelayViewState;
}

export function LeaveSrRelayWorkspace({ client, initialState }: LeaveSrRelayWorkspaceProps) {
  const [state, setState] = useState<LeaveSrRelayViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadLeaveSrRelayView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Leave-SR Relay" detail="Fetching the G04 outbox reconciliation report." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load the Leave-SR Relay"
        detail={`The G04 reconciliation fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No relay entries" detail="The G04 outbox has no leave events to reconcile." />;
  }

  const slice = state.slice;
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G04 leave service register relay"
      data-relay-owner="G04"
      data-dead-letter-state="DEAD_LETTERED"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G04 Relay</p>
          <h2>Leave to Service Register</h2>
        </div>
        <strong>{slice.relayOwner}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Total</dt>
          <dd>{slice.total}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{slice.posted}</dd>
        </div>
        <div>
          <dt>DLQ</dt>
          <dd>{slice.deadLettered}</dd>
        </div>
        <div>
          <dt>Discarded</dt>
          <dd>{slice.discarded}</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G04 relay evidence">
        <li>Replay and discard require custodian action</li>
        <li>G12 append is idempotent by source reference</li>
      </ul>
    </article>
  );
}
