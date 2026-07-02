import { useEffect, useState } from "react";
import { AparSliceSummary, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type AparViewState = SliceViewState<AparSliceSummary>;

/** Loads the G08 summary from GET /api/v1/apar/summary via the injected client. */
export function loadAparView(client: HrmsClient): Promise<AparViewState> {
  return loadSliceView(
    () => client.getAparSlice(),
    (slice) => slice.forms === 0
  );
}

export interface AparWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: AparViewState;
}

export function AparWorkspace({ client, initialState }: AparWorkspaceProps) {
  const [state, setState] = useState<AparViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAparView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading APAR" detail="Fetching the G08 APAR and sealed-cover summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load APAR"
        detail={`The G08 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No APAR forms" detail="No G08 APAR forms are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G08 APAR statutory workspace">
      <header>
        <span className="module-code">G08</span>
        <h2>APAR and Sealed Cover</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Forms</dt>
          <dd>{slice.forms}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{slice.posted}</dd>
        </div>
        <div>
          <dt>Sealed</dt>
          <dd>{slice.sealedCover}</dd>
        </div>
        <div>
          <dt>Suppressed</dt>
          <dd>{slice.g06FeedSuppressed}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        APAR_FINAL_GRADE / {slice.srEventType} / SEALED_COVER / {slice.sealedMarker} / G08_G06_FEED_SUPPRESSED / {slice.feedMarker}
      </p>
    </article>
  );
}
