import { useEffect, useState } from "react";
import { AparSliceSummary, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type AparViewState = SliceViewState<AparSliceSummary>;

export function loadAparView(client: HrmsClient): Promise<AparViewState> {
  return loadSliceView(
    () => client.getAparSlice(),
    (slice) => slice.forms === 0
  );
}

export interface AparWorkspaceProps {
  client: HrmsClient;
  initialState?: AparViewState;
}

export function AparWorkspace({ client, initialState }: AparWorkspaceProps) {
  const [state, setState] = useState<AparViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAparView(client).then((next) => {
      if (mounted) setState(next);
    });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading APAR" detail="Fetching G08 APAR and sealed-cover summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load APAR" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No APAR forms" detail="No G08 APAR forms in scope." />;
  }

  const slice = state.slice;
  const postedRate = slice.forms > 0 ? Math.round(slice.posted / slice.forms * 100) : 0;

  return (
    <article className="record-panel" aria-label="G08 APAR statutory workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G08 APAR</p>
          <h2>APAR and Sealed Cover</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
          {slice.forms} form{slice.forms !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Total Forms" value={slice.forms} />
        <SummaryStat label="Posted to SR" value={slice.posted} />
        <SummaryStat
          label="Sealed Cover"
          value={
            slice.sealedCover > 0 ? (
              <span className="text-amber-600">{slice.sealedCover}</span>
            ) : slice.sealedCover
          }
        />
        <SummaryStat
          label="G06 Suppressed"
          value={
            slice.g06FeedSuppressed > 0 ? (
              <span className="text-red-600">{slice.g06FeedSuppressed}</span>
            ) : slice.g06FeedSuppressed
          }
        />
      </StatGrid>

      {/* Posting progress */}
      {slice.forms > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Posting progress</span>
            <span>{postedRate}% posted</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
              style={{ width: `${postedRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.srEventType}
        </span>
        {slice.sealedCover > 0 && (
          <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] font-mono text-amber-700">
            {slice.sealedMarker}
          </span>
        )}
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.feedMarker}
        </span>
      </div>
    </article>
  );
}
