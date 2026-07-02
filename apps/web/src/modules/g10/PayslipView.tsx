import { useEffect, useState } from "react";
import { EmployeeProfileView, HrmsApiError, HrmsClient, PayrollRunLineView, PayrollRunView } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * P02 fail-closed masking: the API sends governed PII pre-masked per the actor's
 * fieldGrants ("[HIDDEN]" without a grant, the stored masked form with one). When no
 * masked value arrives at all, the view renders "[HIDDEN]" — the raw value never
 * reaches the DOM for an ungranted actor, and the client never unmasks.
 */
export function maskFailClosed(maskedValue?: string): string {
  return maskedValue && maskedValue.trim().length > 0 ? maskedValue : "[HIDDEN]";
}

/** Integer-cents to display rupees; formatting only — no statutory arithmetic in the browser. */
export function formatMoneyCents(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  const rupees = Math.floor(absolute / 100);
  const paise = String(absolute % 100).padStart(2, "0");
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${paise}`;
}

type ProfileState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; profile: EmployeeProfileView };

export interface PayslipViewProps {
  client: HrmsClient;
  /** The payroll run whose computed per-employee lines are the payslip data. */
  run: PayrollRunView | null;
}

/**
 * PH-09E payslip view (BRD G10 FR-06): renders the computed run's component lines
 * (BASIC/DA/HRA earnings, NPS/PT deductions from the PAYROLL_TRACE) per employee with
 * gross/deductions/net totals, plus the employee's PAN masked per P02 via profile-360.
 * The salary bank account number is not exposed by any web-facing API route, so it is
 * rendered fail-closed masked — a raw account number never reaches the DOM.
 */
export function PayslipView({ client, run }: PayslipViewProps) {
  const lines = run?.lines ?? [];
  const [employeeId, setEmployeeId] = useState<string>("");
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });

  const selectedLine: PayrollRunLineView | undefined = lines.find((line) => line.employeeId === employeeId) ?? lines[0];
  const selectedEmployeeId = selectedLine?.employeeId ?? "";

  useEffect(() => {
    if (!selectedEmployeeId) {
      return;
    }
    let mounted = true;
    setProfileState({ kind: "loading" });
    client
      .getEmployeeProfile(selectedEmployeeId)
      .then((profile) => {
        if (mounted) {
          setProfileState({ kind: "ready", profile });
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setProfileState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client, selectedEmployeeId]);

  if (!run || run.lines.length === 0) {
    return (
      <OperationalState
        kind="empty"
        title="No payslips"
        detail="No computed payslip lines yet — run the payroll lifecycle through compute to produce them."
      />
    );
  }
  if (!selectedLine) {
    return <OperationalState kind="empty" title="No payslips" detail="The selected employee has no payslip line in this run." />;
  }

  const maskedPan = profileState.kind === "ready" ? maskFailClosed(profileState.profile.pan) : "[HIDDEN]";

  return (
    <section className="record-panel payslip-view" aria-label="G10 payslip view">
      <h3>Payslip — period {run.period}</h3>
      <label htmlFor="g10-payslip-employee">Employee</label>
      <select id="g10-payslip-employee" name="payslipEmployeeId" onChange={(event) => setEmployeeId(event.target.value)} value={selectedEmployeeId}>
        {lines.map((line) => (
          <option key={line.employeeId} value={line.employeeId}>
            {line.employeeId}
          </option>
        ))}
      </select>

      {profileState.kind === "loading" ? <p data-state="loading">Loading employee identity (P02-masked)…</p> : null}
      {profileState.kind === "error" ? (
        <p role="alert">Employee identity could not be loaded (error code {profileState.errorCode}); PAN stays masked fail-closed.</p>
      ) : null}
      <dl className="payslip-identity" aria-label="Payslip identity (masked per P02)">
        <div>
          <dt>Employee</dt>
          <dd>{profileState.kind === "ready" ? `${profileState.profile.displayName} (${profileState.profile.serviceNo})` : selectedLine.employeeId}</dd>
        </div>
        <div>
          <dt>PAN (masked)</dt>
          <dd data-masked="true">{maskedPan}</dd>
        </div>
        <div>
          <dt>Salary bank account (masked)</dt>
          {/* No web-facing route exposes the salary account number; render fail-closed. */}
          <dd data-masked="true">{maskFailClosed(undefined)}</dd>
        </div>
      </dl>

      <table>
        <caption>Payslip component lines (PAYROLL_TRACE)</caption>
        <thead>
          <tr>
            <th scope="col">Component</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {selectedLine.trace.map((step) => (
            <tr key={step.code}>
              <td>{step.code}</td>
              <td>{formatMoneyCents(step.amountCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Gross</th>
            <td>{formatMoneyCents(selectedLine.grossCents)}</td>
          </tr>
          <tr>
            <th scope="row">Deductions</th>
            <td>{formatMoneyCents(selectedLine.deductionsCents)}</td>
          </tr>
          <tr>
            <th scope="row">Net pay</th>
            <td>{formatMoneyCents(selectedLine.netPayCents)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
