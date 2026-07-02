import { useEffect, useState } from "react";
import { HrmsClient, TrainingSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type TrainingViewState = SliceViewState<TrainingSliceSummary>;

/** Loads the G07 summary from GET /api/v1/training/summary via the injected client. */
export function loadTrainingView(client: HrmsClient): Promise<TrainingViewState> {
  return loadSliceView(
    () => client.getTrainingSlice(),
    (slice) => slice.sessions === 0
  );
}

export interface TrainingWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: TrainingViewState;
}

export function TrainingWorkspace({ client, initialState }: TrainingWorkspaceProps) {
  const [state, setState] = useState<TrainingViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadTrainingView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Training" detail="Fetching the G07 training and certification summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Training"
        detail={`The G07 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No training sessions" detail="No G07 training sessions are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G07 training statutory workspace">
      <header>
        <span className="module-code">G07</span>
        <h2>Training and Certification</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Sessions</dt>
          <dd>{slice.sessions}</dd>
        </div>
        <div>
          <dt>Approved</dt>
          <dd>{slice.approved}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{slice.completed}</dd>
        </div>
        <div>
          <dt>SR Posted</dt>
          <dd>{slice.srPosted}</dd>
        </div>
      </dl>
      <p className="evidence-line">{`WF-G07-NOMINATION / TRAINING_CERTIFICATION_POSTED / ${slice.srEventType}`}</p>
    </article>
  );
}
