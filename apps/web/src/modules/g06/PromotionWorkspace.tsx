import { useEffect, useState } from "react";
import { HrmsClient, PromotionSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type PromotionViewState = SliceViewState<PromotionSliceSummary>;

export function loadPromotionView(client: HrmsClient): Promise<PromotionViewState> {
  return loadSliceView(
    () => client.getPromotionSlice(),
    (slice) => slice.seniorityLists === 0 && slice.promotionOrders === 0 && slice.macpEffected === 0
  );
}

export interface PromotionWorkspaceProps {
  client: HrmsClient;
  initialState?: PromotionViewState;
}

export function PromotionWorkspace({ client, initialState }: PromotionWorkspaceProps) {
  const [state, setState] = useState<PromotionViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPromotionView(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Promotions" detail="Fetching G06 promotion and seniority summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Promotions" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No promotion records" detail="No G06 seniority lists, DPC orders, or MACP effects in scope." />;
  }

  const slice = state.slice;

  return (
    <article className="record-panel" aria-label="G06 promotion statutory workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G06 Promotions</p>
          <h2>Promotion and Seniority</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          {slice.promotionOrders} order{slice.promotionOrders !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Seniority Lists" value={slice.seniorityLists} />
        <SummaryStat label="Promotion Orders" value={slice.promotionOrders} />
        <SummaryStat label="MACP Effected" value={slice.macpEffected} />
        <SummaryStat label="Pay Signals" value={slice.paySignalsReady} />
      </StatGrid>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.srEventType}
        </span>
        <span className="inline-flex rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-mono text-indigo-700">
          DPC_QUORUM
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          DPC_RECUSAL
        </span>
      </div>
    </article>
  );
}
