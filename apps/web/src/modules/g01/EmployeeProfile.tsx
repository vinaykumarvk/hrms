import { useEffect, useState } from "react";
import { EmployeeProfileView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

export type ProfileViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; profile: EmployeeProfileView };

/**
 * Loads the G01 profile-360 through the injected API client. Without an explicit
 * employeeId the first employee visible in the caller's scope is resolved via the
 * paged employees list, then the governed profile is fetched.
 */
export async function loadEmployeeProfile(client: HrmsClient, employeeId?: string): Promise<ProfileViewState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "empty" };
    }
    const profile = await client.getEmployeeProfile(targetId);
    return { kind: "ready", profile };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

/**
 * P02 display-of-server-truth: the API returns Aadhaar already masked per the actor's
 * fieldGrants — the stored masked form (xxxx-xxxx-1234) with a grant, "[HIDDEN]" without.
 * This helper only normalises the display casing to the BRD XXXX-XXXX-1234 form and renders
 * a full placeholder when the grant is withheld. It never reconstructs or unmasks PII.
 */
export function formatMaskedAadhaar(value: string | undefined): string {
  if (!value || value === "[HIDDEN]") {
    return "XXXX-XXXX-XXXX";
  }
  return value.toUpperCase();
}

export interface EmployeeProfileProps {
  client: HrmsClient;
  employeeId?: string;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: ProfileViewState;
}

export function EmployeeProfile({ client, employeeId, initialState }: EmployeeProfileProps) {
  const [state, setState] = useState<ProfileViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadEmployeeProfile(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading profile-360" detail="Fetching the G01 employee master record." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load profile-360"
        detail={`The employee profile request failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No employees" detail="No employee master records are visible in this scope." />;
  }

  const profile = state.profile;
  return (
    <section className="record-panel" id="employees" aria-label="profile-360">
      <div className="panel-heading">
        <div>
          <h2>Employee profile-360</h2>
          <p>G01 master record with P02 masked PII and fieldGrants evidence.</p>
        </div>
        <strong>{profile.employmentStatus}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Service no</dt>
          <dd>{profile.serviceNo}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{profile.displayName}</dd>
        </div>
        <div>
          <dt>Designation</dt>
          <dd>{profile.designation ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Org placement</dt>
          <dd>{profile.orgUnitId}</dd>
        </div>
        <div>
          <dt>Employment status</dt>
          <dd>{profile.employmentStatus}</dd>
        </div>
        <div>
          <dt>Date of joining</dt>
          <dd>{profile.dateOfJoining ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Aadhaar (masked)</dt>
          <dd>{formatMaskedAadhaar(profile.aadhaarMasked)}</dd>
        </div>
        <div>
          <dt>PAN (governed)</dt>
          <dd>{profile.pan ?? "[HIDDEN]"}</dd>
        </div>
      </dl>
      <p className="record-note">
        PII rows render the server-masked values as returned per P02 fieldGrants; nothing is unmasked client-side.
      </p>
    </section>
  );
}
