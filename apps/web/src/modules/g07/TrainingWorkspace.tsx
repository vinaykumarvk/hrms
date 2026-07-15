import { useEffect, useState } from "react";
import { HrmsClient, TrainingSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";
import { SummaryStat, StatGrid } from "../g14/Charts";

export type TrainingViewState = SliceViewState<TrainingSliceSummary>;

export function loadTrainingView(client: HrmsClient): Promise<TrainingViewState> {
  return loadSliceView(
    () => client.getTrainingSlice(),
    (slice) => slice.sessions === 0
  );
}

export interface TrainingWorkspaceProps {
  client: HrmsClient;
  initialState?: TrainingViewState;
}

export function TrainingWorkspace({ client, initialState }: TrainingWorkspaceProps) {
  const [state, setState] = useState<TrainingViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadTrainingView(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Training" detail="Fetching G07 training and certification summary." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Training" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No training sessions" detail="No G07 training sessions in scope." />;
  }

  const slice = state.slice;
  const completeRate = slice.sessions > 0 ? Math.round(slice.completed / slice.sessions * 100) : 0;

  return (
    <article className="record-panel" aria-label="G07 training statutory workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G07 Training</p>
          <h2>Training and Certification</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
          {slice.sessions} session{slice.sessions !== 1 ? "s" : ""}
        </span>
      </div>

      <StatGrid columns={4}>
        <SummaryStat label="Total Sessions" value={slice.sessions} />
        <SummaryStat label="Approved" value={slice.approved} />
        <SummaryStat label="Completed" value={slice.completed} />
        <SummaryStat label="SR Posted" value={slice.srPosted} />
      </StatGrid>

      {slice.sessions > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Completion progress</span>
            <span>{completeRate}% completed</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all"
              style={{ width: `${completeRate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          WF-G07-NOMINATION
        </span>
        <span className="inline-flex rounded bg-teal-100 px-2 py-0.5 text-[10px] font-mono text-teal-700">
          {slice.srEventType}
        </span>
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
          TRAINING_CERTIFICATION_POSTED
        </span>
      </div>
    </article>
  );
}
