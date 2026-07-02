import { useEffect, useState } from "react";
import { HrmsClient, PersonalDetailsSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type PersonalDetailsViewState = SliceViewState<PersonalDetailsSliceSummary>;

/** Loads the newest G02 change request from GET /api/v1/personal-details/change-requests via the injected client. */
export function loadPersonalDetailsView(client: HrmsClient): Promise<PersonalDetailsViewState> {
  return loadSliceView(() => client.getPersonalDetailsSlice());
}

export interface PersonalDetailsWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: PersonalDetailsViewState;
}

export function PersonalDetailsWorkspace({ client, initialState }: PersonalDetailsWorkspaceProps) {
  const [state, setState] = useState<PersonalDetailsViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPersonalDetailsView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Personal Details" detail="Fetching the G02 change-request summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Personal Details"
        detail={`The G02 change-request fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No change requests" detail="No G02 personal-details change requests are in scope." />;
  }

  const slice = state.slice;
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G02 personal details transaction"
      data-workflow-code="WF-G02-PERSONAL-DETAILS"
      data-owner-module="G01"
      data-evidence-module="G13"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>Personal Details Workflow</h2>
        </div>
        <strong>{slice.status}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Request</dt>
          <dd>{slice.requestNo}</dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>{slice.fieldCode}</dd>
        </div>
        <div>
          <dt>Routing</dt>
          <dd>{slice.sensitivity}</dd>
        </div>
        <div>
          <dt>SR owner</dt>
          <dd>{slice.ownerModule}</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G02 evidence">
        <li>{slice.documentCount} G13 evidence document</li>
        <li>Commit and reversal route through G01</li>
      </ul>
    </article>
  );
}
