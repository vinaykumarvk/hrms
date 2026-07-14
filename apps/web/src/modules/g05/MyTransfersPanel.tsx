import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, TransferOrderRecord } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my transfers". */
type MyTransfersState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; orders: TransferOrderRecord[] };

const TRANSFER_ACK_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You may only acknowledge your own transfer order.",
  PRECONDITION_FAILED: "This order is not at the status acknowledgement requires (must be served and not yet acknowledged).",
  NOT_FOUND: "The transfer order could not be found.",
};

function describeAckError(errorCode: string): string {
  return TRANSFER_ACK_ERROR_MESSAGES[errorCode] ?? "The order could not be acknowledged.";
}

async function loadMyTransfers(client: HrmsClient, employeeId: string): Promise<MyTransfersState> {
  try {
    const { items } = await client.listMyTransferOrders(employeeId);
    return { kind: "ready", orders: items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyTransfersPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-orders-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G05 self-service: "request a transfer or view transfer orders — submit preferences, track
 * status". Lists only the employee's own transfer orders via
 * GET /api/v1/transfers/employees/{id}, and lets them acknowledge a served order via
 * POST /api/v1/transfers/orders/{id}/acknowledge — no manual order-id entry required.
 */
export function MyTransfersPanel({ client, employeeId, refreshToken }: MyTransfersPanelProps) {
  const [state, setState] = useState<MyTransfersState>({ kind: "loading" });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [ackError, setAckError] = useState<{ orderId: string; errorCode: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyTransfers(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken, localRefresh]);

  function handleAcknowledge(orderId: string) {
    setAcknowledgingId(orderId);
    setAckError(null);
    void client
      .acknowledgeTransferOrder(orderId, { acknowledgedAt: new Date().toISOString() }, crypto.randomUUID())
      .then(() => {
        setAcknowledgingId(null);
        setLocalRefresh((token) => token + 1);
      })
      .catch((error: unknown) => {
        setAcknowledgingId(null);
        setAckError({ orderId, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  return (
    <section className="record-panel g05-my-transfers-panel" aria-label="G05 my transfers">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfers</p>
          <h2>My Transfers</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my transfers" detail="Fetching your transfer orders." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my transfers" detail={`The transfers request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" && state.orders.length === 0 ? (
        <OperationalState kind="empty" title="No transfer orders yet" detail="You have no transfer orders on file yet." />
      ) : null}
      {state.kind === "ready" && state.orders.length > 0 ? (
        <ul className="satellite-list" aria-label="My transfer orders">
          {state.orders.map((order) => (
            <li key={order.id}>
              <div>
                <strong>{order.orderNo}</strong> ({order.fromOrgUnitId} to {order.toOrgUnitId}) — {order.status}
                {order.acknowledgedAt ? " — acknowledged" : order.servedOnDate ? " — served, awaiting acknowledgement" : ""}
              </div>
              {order.servedOnDate && !order.acknowledgedAt ? (
                <>
                  <button disabled={acknowledgingId !== null} onClick={() => handleAcknowledge(order.id)} type="button">
                    {acknowledgingId === order.id ? "Acknowledging…" : "Acknowledge"}
                  </button>
                  {ackError?.orderId === order.id ? (
                    <p role="alert">
                      Acknowledgement failed with error code {ackError.errorCode}: {describeAckError(ackError.errorCode)}
                    </p>
                  ) : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
