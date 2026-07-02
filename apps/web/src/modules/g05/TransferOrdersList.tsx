import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, TransferOrderRecord } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the transfer orders list. */
type OrdersState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; orders: TransferOrderRecord[] };

export interface TransferOrdersListProps {
  client: HrmsClient;
  /** Bump to refetch the list (e.g. after the initiate form creates an order). */
  refreshToken: number;
}

/**
 * PH-06D transfer orders view: lists GET /api/v1/transfers/orders with
 * PARALLEL_ALL_OF clearance progress per order.
 */
export function TransferOrdersList({ client, refreshToken }: TransferOrdersListProps) {
  const [state, setState] = useState<OrdersState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .listTransferOrders()
      .then((result) => {
        if (mounted) {
          setState(result.items.length === 0 ? { kind: "empty" } : { kind: "ready", orders: result.items });
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client, refreshToken]);

  return (
    <section className="record-panel transfer-orders-panel" aria-label="G05 transfer orders">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfer</p>
          <h2>Transfer Orders</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading transfer orders" detail="Fetching G05 transfer orders and clearance progress." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load transfer orders"
          detail={`The transfer order list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No transfer orders" detail="No transfer orders exist yet. Initiate one above." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="transfer-order-list" aria-label="Transfer orders with clearance progress">
          {state.orders.map((order) => {
            const total = order.clearanceItems.length;
            const cleared = order.clearanceItems.filter((item) => item.status !== "OPEN").length;
            return (
              <li key={order.id}>
                <div>
                  <strong>{order.orderNo}</strong> — {order.employeeId}: {order.fromOrgUnitId} → {order.toOrgUnitId},
                  effective {order.effectiveDate}
                </div>
                <div>
                  Status {order.status}; clearances {cleared} of {total} complete
                  {total > 0 ? ` (${order.clearanceItems.map((item) => `${item.code} ${item.status}`).join(", ")})` : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
