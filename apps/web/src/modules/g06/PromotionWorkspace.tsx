import { useEffect, useState } from "react";
import { HrmsClient, PromotionSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type PromotionViewState = SliceViewState<PromotionSliceSummary>;

/** Loads the G06 summary from GET /api/v1/promotions/summary via the injected client. */
export function loadPromotionView(client: HrmsClient): Promise<PromotionViewState> {
  return loadSliceView(
    () => client.getPromotionSlice(),
    (slice) => slice.seniorityLists === 0 && slice.promotionOrders === 0 && slice.macpEffected === 0
  );
}

export interface PromotionWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: PromotionViewState;
}

export function PromotionWorkspace({ client, initialState }: PromotionWorkspaceProps) {
  const [state, setState] = useState<PromotionViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPromotionView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Promotions" detail="Fetching the G06 promotion and seniority summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Promotions"
        detail={`The G06 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No promotion records" detail="No G06 seniority lists, DPC orders, or MACP effects are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G06 promotion statutory workspace">
      <header>
        <span className="module-code">G06</span>
        <h2>Promotion and Seniority</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Seniority Lists</dt>
          <dd>{slice.seniorityLists}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd>{slice.promotionOrders}</dd>
        </div>
        <div>
          <dt>MACP</dt>
          <dd>{slice.macpEffected}</dd>
        </div>
        <div>
          <dt>G10 Signals</dt>
          <dd>{slice.paySignalsReady}</dd>
        </div>
      </dl>
      <p className="evidence-line">{`DPC_QUORUM / DPC_RECUSAL / ${slice.srEventType} / G06_PAY_IMPACT_SIGNAL`}</p>
    </article>
  );
}
