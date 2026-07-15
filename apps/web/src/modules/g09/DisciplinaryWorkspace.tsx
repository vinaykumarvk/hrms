import { useEffect, useState } from "react";
import { DisciplinarySliceSummary, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type DisciplinaryViewState = SliceViewState<DisciplinarySliceSummary>;

export function loadDisciplinaryView(client: HrmsClient): Promise<DisciplinaryViewState> {
  return loadSliceView(
    () => client.getDisciplinarySlice(),
    (slice) => slice.cases === 0
  );
}

export interface DisciplinaryWorkspaceProps {
  client: HrmsClient;
  initialState?: DisciplinaryViewState;
}

export function DisciplinaryWorkspace({ client, initialState }: DisciplinaryWorkspaceProps) {
  const [state, setState] = useState<DisciplinaryViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDisciplinaryView(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Disciplinary" detail="Fetching G09 case and penalty summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Disciplinary" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No disciplinary cases" detail="No G09 disciplinary cases in scope." />;
  }

  const slice = state.slice;
  const penaltyRate = slice.cases > 0 ? Math.round(slice.penalties / slice.cases * 100) : 0;

  return (
    <article className="record-panel" aria-label="G09 disciplinary statutory workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G09 Discipline</p>
          <h2>Disciplinary Due Process</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
          {slice.cases} case{slice.cases !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Total Cases" value={slice.cases} />
        <SummaryStat
          label="Penalties"
          value={
            slice.penalties > 0 ? (
              <span className="text-red-600">{slice.penalties}</span>
            ) : slice.penalties
          }
        />
        <SummaryStat
          label="Confidential"
          value={
            slice.confidential > 0 ? (
              <span className="text-amber-600">{slice.confidential}</span>
            ) : slice.confidential
          }
        />
        <SummaryStat label="Impact Signals" value={slice.impactSignals} />
      </StatGrid>

      {slice.cases > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Resolution progress</span>
            <span>{penaltyRate}% penalised</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all"
              style={{ width: `${penaltyRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.competenceMarker}
        </span>
        <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono text-red-700">
          {slice.penaltyEventType}
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          {slice.appealMarker}
        </span>
      </div>
    </article>
  );
}
