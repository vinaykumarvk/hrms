import { useEffect, useState } from "react";
import { HrmsClient, PensionSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type PensionViewState = SliceViewState<PensionSliceSummary>;

/** Loads the G11 summary from GET /api/v1/pension/summary via the injected client. */
export function loadPensionView(client: HrmsClient): Promise<PensionViewState> {
  return loadSliceView(
    () => client.getPensionSlice(),
    (slice) => slice.cases === 0
  );
}

export interface PensionWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: PensionViewState;
}

export function PensionWorkspace({ client, initialState }: PensionWorkspaceProps) {
  const [state, setState] = useState<PensionViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPensionView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Pension" detail="Fetching the G11 retirement and pension case summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Pension"
        detail={`The G11 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No pension cases" detail="No G11 retirement or pension cases are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G11 pension compensation workspace">
      <header>
        <span className="module-code">G11</span>
        <h2>Retirement and Pension</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Cases</dt>
          <dd>{slice.cases}</dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>{slice.serviceVerified}</dd>
        </div>
        <div>
          <dt>PPOs</dt>
          <dd>{slice.pposIssued}</dd>
        </div>
        <div>
          <dt>SR Events</dt>
          <dd>{slice.srPosted}</dd>
        </div>
      </dl>
      <dl className="control-markers" aria-label="G11 pension control markers">
        <div>
          <dt>Service gate</dt>
          <dd>{slice.serviceGateMarker /* SR_VERIFICATION_GATE */}</dd>
        </div>
        <div>
          <dt>Qualifying service</dt>
          <dd>{slice.qualifyingServiceMarker /* QUALIFYING_SERVICE_LOCKED */}</dd>
        </div>
        <div>
          <dt>Calculation trace</dt>
          <dd>{slice.calculationMarker /* PENSION_CALC_TRACE */}</dd>
        </div>
        <div>
          <dt>PPO</dt>
          <dd>{slice.ppoMarker /* PPO_ISSUED */}</dd>
        </div>
        <div>
          <dt>SR posting</dt>
          <dd>{slice.srMarker /* G11_SR_POSTED */}</dd>
        </div>
      </dl>
    </article>
  );
}
