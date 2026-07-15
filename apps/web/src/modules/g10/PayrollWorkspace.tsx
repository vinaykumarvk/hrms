import { useEffect, useState } from "react";
import { HrmsClient, PayrollSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type PayrollViewState = SliceViewState<PayrollSliceSummary>;

export function loadPayrollView(client: HrmsClient): Promise<PayrollViewState> {
  return loadSliceView(
    () => client.getPayrollSlice(),
    (slice) => slice.salaryStructures === 0 && slice.runs === 0
  );
}

export interface PayrollWorkspaceProps {
  client: HrmsClient;
  initialState?: PayrollViewState;
}

export function PayrollWorkspace({ client, initialState }: PayrollWorkspaceProps) {
  const [state, setState] = useState<PayrollViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPayrollView(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Payroll" detail="Fetching G10 payroll run summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Payroll" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No payroll runs" detail="No G10 salary structures or payroll runs in scope." />;
  }

  const slice = state.slice;
  const disbursedRate = slice.runs > 0 ? Math.round(slice.disbursedRuns / slice.runs * 100) : 0;

  return (
    <article className="record-panel" aria-label="G10 payroll compensation workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G10 Payroll</p>
          <h2>Payroll and Benefits</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
          {slice.runs} run{slice.runs !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Structures" value={slice.salaryStructures} />
        <SummaryStat label="Total Runs" value={slice.runs} />
        <SummaryStat label="Disbursed" value={slice.disbursedRuns} />
        <SummaryStat label="LPD Feeds" value={slice.lastPayDrawnFeeds} />
      </StatGrid>

      {slice.runs > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Disbursement progress</span>
            <span>{disbursedRate}% completed</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
              style={{ width: `${disbursedRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.calculationMarker}
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.ruleSnapshotMarker}
        </span>
        <span className="inline-flex rounded bg-blue-100 px-2 py-0.5 text-[10px] font-mono text-blue-700">
          {slice.inputLockMarker}
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.x3Marker}
        </span>
        <span className="inline-flex rounded bg-green-100 px-2 py-0.5 text-[10px] font-mono text-green-700">
          {slice.lastPayMarker}
        </span>
      </div>
    </article>
  );
}
