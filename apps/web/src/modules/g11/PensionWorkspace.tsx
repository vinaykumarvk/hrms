import { useEffect, useState } from "react";
import { HrmsClient, PensionSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type PensionViewState = SliceViewState<PensionSliceSummary>;

export function loadPensionView(client: HrmsClient): Promise<PensionViewState> {
  return loadSliceView(
    () => client.getPensionSlice(),
    (slice) => slice.cases === 0
  );
}

export interface PensionWorkspaceProps {
  client: HrmsClient;
  initialState?: PensionViewState;
}

export function PensionWorkspace({ client, initialState }: PensionWorkspaceProps) {
  const [state, setState] = useState<PensionViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPensionView(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Pension" detail="Fetching G11 retirement and pension case summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Pension" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No pension cases" detail="No G11 retirement or pension cases in scope." />;
  }

  const slice = state.slice;
  const verifyRate = slice.cases > 0 ? Math.round(slice.serviceVerified / slice.cases * 100) : 0;

  return (
    <article className="record-panel" aria-label="G11 pension compensation workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G11 Retirement</p>
          <h2>Retirement and Pension</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          {slice.cases} case{slice.cases !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Total Cases" value={slice.cases} />
        <SummaryStat label="Service Verified" value={slice.serviceVerified} />
        <SummaryStat label="PPOs Issued" value={slice.pposIssued} />
        <SummaryStat label="SR Posted" value={slice.srPosted} />
      </StatGrid>

      {slice.cases > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Verification progress</span>
            <span>{verifyRate}% verified</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
              style={{ width: `${verifyRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.serviceGateMarker}
        </span>
        <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] font-mono text-amber-700">
          {slice.qualifyingServiceMarker}
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.calculationMarker}
        </span>
        <span className="inline-flex rounded bg-green-100 px-2 py-0.5 text-[10px] font-mono text-green-700">
          {slice.ppoMarker}
        </span>
        <span className="inline-flex rounded bg-blue-100 px-2 py-0.5 text-[10px] font-mono text-blue-700">
          {slice.srMarker}
        </span>
      </div>
    </article>
  );
}
