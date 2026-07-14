import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PayslipRecordView, YtdStatementView } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee's own payslip history + YTD statement. */
type PayslipsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; records: PayslipRecordView[]; ytd: YtdStatementView };

function formatCents(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

async function loadPayslips(client: HrmsClient, employeeId: string): Promise<PayslipsState> {
  try {
    const [{ items }, { ytd }] = await Promise.all([client.listMyPayslips(employeeId), client.getMyYtdStatement(employeeId)]);
    return items.length === 0 ? { kind: "empty" } : { kind: "ready", records: items, ytd };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyPayslipsPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (payslips are strictly self-scoped server-side; unlike
   *  other G01 panels there is no safe "first employee in the tenant" fallback for this read). */
  employeeId: string;
}

/**
 * G10 self-service payslip history (FR-G10-13) and YTD statement (FR-G10-06): lists the
 * employee's own PUBLISHED payslips via GET /api/v1/payroll/employees/{id}/payslips (P02
 * own-record scope enforced server-side) with a full earnings/deductions breakdown per payslip,
 * plus a year-to-date summary.
 */
export function MyPayslipsPanel({ client, employeeId }: MyPayslipsPanelProps) {
  const [state, setState] = useState<PayslipsState>({ kind: "loading" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadPayslips(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId]);

  return (
    <section className="record-panel g10-my-payslips-panel" aria-label="G10 my payslips">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G10 Payroll</p>
          <h2>My Payslips</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading payslips" detail="Fetching your published payslip history." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load payslips" detail={`The payslip list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No payslips yet" detail="No published payslips are on file for you yet." />
      ) : null}
      {state.kind === "ready" ? (
        <>
          <dl className="record-facts" aria-label="Year-to-date summary">
            <div>
              <dt>YTD gross</dt>
              <dd>{formatCents(state.ytd.grossCents)}</dd>
            </div>
            <div>
              <dt>YTD deductions</dt>
              <dd>{formatCents(state.ytd.deductionsCents)}</dd>
            </div>
            <div>
              <dt>YTD net</dt>
              <dd>{formatCents(state.ytd.netCents)}</dd>
            </div>
          </dl>
          <ul className="satellite-list" aria-label="My payslip history">
            {state.records.map((record) => (
              <li key={record.payslip.id}>
                <div>
                  <strong>{record.payslip.payslipNo}</strong> — {record.payslip.period} — net {formatCents(record.payslip.netPayCents)}
                  <button
                    aria-expanded={expandedId === record.payslip.id}
                    onClick={() => setExpandedId(expandedId === record.payslip.id ? null : record.payslip.id)}
                    type="button"
                  >
                    {expandedId === record.payslip.id ? "Hide breakdown" : "View breakdown"}
                  </button>
                </div>
                {expandedId === record.payslip.id ? (
                  <ul aria-label={`Line-item breakdown for ${record.payslip.payslipNo}`}>
                    {record.lines.map((line) => (
                      <li key={`${record.payslip.id}-${line.sequenceNo}`}>
                        {line.componentCode} ({line.lineType}): {formatCents(line.amountCents)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
