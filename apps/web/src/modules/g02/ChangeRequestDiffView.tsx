import { useEffect, useState } from "react";
import { ChangeRequestDiffResult, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the per-field diff of one change request. */
type DiffState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; diff: ChangeRequestDiffResult };

export interface ChangeRequestDiffViewProps {
  client: HrmsClient;
  requestId: string;
}

/**
 * PH-07E G02 masked diff view: renders GET /api/v1/change-requests/{id}/diff (FR-G02-005).
 * P02 masking is applied server-side — rows flagged `masked` already carry "[HIDDEN]" in both
 * oldValue and newValue and are rendered exactly as returned, never reconstructed.
 */
export function ChangeRequestDiffView({ client, requestId }: ChangeRequestDiffViewProps) {
  const [state, setState] = useState<DiffState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .getPersonalDetailChangeRequestDiff(requestId)
      .then((diff) => {
        if (mounted) {
          setState(diff.fields.length === 0 ? { kind: "empty" } : { kind: "ready", diff });
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client, requestId]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading diff" detail="Fetching the field-level change diff." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState kind="error" title="Could not load diff" detail={`The diff request failed with error code ${state.errorCode}.`} />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No changed fields" detail="This change request carries no field-level diff rows." />;
  }

  const diff = state.diff;
  return (
    <div className="g02-diff-view" aria-label={`Field diff for ${diff.requestNo}`}>
      <p>
        Diff for {diff.requestNo} (revision {diff.revisionNo}, status {diff.status})
      </p>
      <table className="g02-diff-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Old value</th>
            <th scope="col">New value</th>
            <th scope="col">Sensitivity</th>
          </tr>
        </thead>
        <tbody>
          {diff.fields.map((field) => (
            <tr key={field.fieldCode} data-masked={field.masked}>
              <td>{field.displayLabel}</td>
              <td>{field.oldValue}</td>
              <td>{field.newValue}</td>
              <td>
                {field.sensitivity}
                {field.masked ? " (masked per P02)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
