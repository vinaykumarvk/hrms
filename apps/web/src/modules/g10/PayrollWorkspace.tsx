import { useEffect, useState } from "react";
import { HrmsClient, PayrollSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type PayrollViewState = SliceViewState<PayrollSliceSummary>;

/** Loads the G10 summary from GET /api/v1/payroll/summary via the injected client. */
export function loadPayrollView(client: HrmsClient): Promise<PayrollViewState> {
  return loadSliceView(
    () => client.getPayrollSlice(),
    (slice) => slice.salaryStructures === 0 && slice.runs === 0
  );
}

export interface PayrollWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: PayrollViewState;
}

export function PayrollWorkspace({ client, initialState }: PayrollWorkspaceProps) {
  const [state, setState] = useState<PayrollViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPayrollView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Payroll" detail="Fetching the G10 payroll run summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Payroll"
        detail={`The G10 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No payroll runs" detail="No G10 salary structures or payroll runs are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G10 payroll compensation workspace">
      <header>
        <span className="module-code">G10</span>
        <h2>Payroll and Benefits</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Structures</dt>
          <dd>{slice.salaryStructures}</dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{slice.runs}</dd>
        </div>
        <div>
          <dt>Disbursed</dt>
          <dd>{slice.disbursedRuns}</dd>
        </div>
        <div>
          <dt>LPD Feeds</dt>
          <dd>{slice.lastPayDrawnFeeds}</dd>
        </div>
      </dl>
      <dl className="control-markers" aria-label="G10 payroll control markers">
        <div>
          <dt>Calculation trace</dt>
          <dd>{slice.calculationMarker /* PAYROLL_TRACE */}</dd>
        </div>
        <div>
          <dt>Rule snapshot</dt>
          <dd>{slice.ruleSnapshotMarker /* RULE_VERSION_SNAPSHOT */}</dd>
        </div>
        <div>
          <dt>Input lock</dt>
          <dd>{slice.inputLockMarker /* INPUT_LOCKED */}</dd>
        </div>
        <div>
          <dt>Bank export</dt>
          <dd>{slice.x3Marker /* BANK_X3_EXPORT */}</dd>
        </div>
        <div>
          <dt>Last pay drawn</dt>
          <dd>{slice.lastPayMarker /* LAST_PAY_DRAWN */}</dd>
        </div>
      </dl>
    </article>
  );
}
