import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PromotionOrderView, ProbationRecordView, PromotionRefusalView, SealedCoverCase } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my promotion & posting history". */
type MyPromotionState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | {
      kind: "ready";
      orders: PromotionOrderView[];
      probationRecords: ProbationRecordView[];
      refusals: PromotionRefusalView[];
      sealedCovers: SealedCoverCase[];
    };

async function loadMyPromotionHistory(client: HrmsClient, employeeId: string): Promise<MyPromotionState> {
  try {
    const [ordersResult, probationResult, refusalsResult, sealedCoversResult] = await Promise.all([
      client.listMyPromotionOrders(),
      client.listMyProbationRecords(employeeId),
      client.listMyPromotionRefusals(employeeId),
      client.listSealedCovers(),
    ]);
    return {
      kind: "ready",
      orders: ordersResult.items,
      probationRecords: probationResult.probationRecords,
      refusals: refusalsResult.refusals,
      sealedCovers: sealedCoversResult.items,
    };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyPromotionPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-records-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G06 self-service: "view promotion & posting history / track promotion case status; view
 * sealed-cover status concerning me". Lists only the employee's own promotion orders
 * (GET /api/v1/promotions/orders), probation records and refusal history
 * (GET /api/v1/promotions/probation-records|refusals?employeeId=...), and their own sealed-cover
 * status (GET /api/v1/promotions/sealed-covers) — the confidential `reason` naming the underlying
 * disciplinary/vigilance matter is redacted server-side for a self-service caller, so only
 * `status` is ever shown here.
 */
export function MyPromotionPanel({ client, employeeId, refreshToken }: MyPromotionPanelProps) {
  const [state, setState] = useState<MyPromotionState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyPromotionHistory(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  return (
    <section className="record-panel g06-my-promotion-panel" aria-label="G06 my promotion history">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G06 Promotions</p>
          <h2>My Promotion &amp; Posting History</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my promotion history" detail="Fetching your promotion orders and case status." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my promotion history" detail={`The request failed with error code ${state.errorCode}.`} />
      ) : null}

      {state.kind === "ready" ? (
        <>
          <h3>Promotion Orders</h3>
          {state.orders.length === 0 ? (
            <OperationalState kind="empty" title="No promotion orders yet" detail="You have no promotion orders on file yet." />
          ) : (
            <ul className="satellite-list" aria-label="My promotion orders">
              {state.orders.map((order) => (
                <li key={order.id}>
                  <strong>{order.orderNo}</strong> ({order.fromDesignation} → {order.toDesignation}) — {order.status}
                </li>
              ))}
            </ul>
          )}

          {state.probationRecords.length > 0 ? (
            <>
              <h3>Probation</h3>
              <ul className="satellite-list" aria-label="My probation records">
                {state.probationRecords.map((record) => (
                  <li key={record.id}>
                    {record.status} — {record.probationStart} to {record.scheduledEnd} ({record.probationMonths} months)
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {state.refusals.length > 0 ? (
            <>
              <h3>Refusals</h3>
              <ul className="satellite-list" aria-label="My promotion refusals">
                {state.refusals.map((refusal) => (
                  <li key={refusal.id}>
                    Refused on {refusal.refusalDate} — debarred until {refusal.debarmentUntil} ({refusal.status})
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3>Sealed Cover</h3>
          {state.sealedCovers.length === 0 ? (
            <OperationalState kind="empty" title="No sealed cover on file" detail="You have no sealed-cover DPC recommendation pending." />
          ) : (
            <ul className="satellite-list" aria-label="My sealed cover status">
              {state.sealedCovers.map((cover) => (
                <li key={cover.id}>
                  {cover.status}
                  {cover.status === "SEALED" ? " — a DPC recommendation is being held pending an ongoing proceeding; details are confidential." : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
