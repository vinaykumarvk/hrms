import { useEffect, useState } from "react";
import { DisciplinarySliceSummary, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type DisciplinaryViewState = SliceViewState<DisciplinarySliceSummary>;

/** Loads the G09 summary from GET /api/v1/disciplinary/summary via the injected client. */
export function loadDisciplinaryView(client: HrmsClient): Promise<DisciplinaryViewState> {
  return loadSliceView(
    () => client.getDisciplinarySlice(),
    (slice) => slice.cases === 0
  );
}

export interface DisciplinaryWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: DisciplinaryViewState;
}

export function DisciplinaryWorkspace({ client, initialState }: DisciplinaryWorkspaceProps) {
  const [state, setState] = useState<DisciplinaryViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDisciplinaryView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Disciplinary" detail="Fetching the G09 case and penalty summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Disciplinary"
        detail={`The G09 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No disciplinary cases" detail="No G09 disciplinary cases are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G09 disciplinary statutory workspace">
      <header>
        <span className="module-code">G09</span>
        <h2>Disciplinary Due Process</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Cases</dt>
          <dd>{slice.cases}</dd>
        </div>
        <div>
          <dt>Penalties</dt>
          <dd>{slice.penalties}</dd>
        </div>
        <div>
          <dt>Confidential</dt>
          <dd>{slice.confidential}</dd>
        </div>
        <div>
          <dt>Impact</dt>
          <dd>{slice.impactSignals}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        G09_AUTHORITY_COMPETENCE / {slice.competenceMarker} / CHARGE_MEMO_SERVED / INQUIRY_REPORT / MAJOR_PENALTY / {slice.penaltyEventType} / APPEAL_DECIDED / {slice.appealMarker}
      </p>
    </article>
  );
}
