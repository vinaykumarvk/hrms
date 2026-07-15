import { useEffect, useMemo, useState } from "react";
import { HrmsApiError, HrmsClient, TransferOrderRecord } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";

/* ── Types ─────────────────────────────────────────────────── */

type OrdersState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; orders: TransferOrderRecord[] };

export interface TransferOrdersListProps {
  client: HrmsClient;
  refreshToken: number;
}

/* ── Columns ───────────────────────────────────────────────── */

type TransferColumn = "orderNo" | "employeeId" | "orgUnits" | "effective" | "status" | "clearances";

const TRANSFER_COLUMNS: DataTableColumnDef<TransferOrderRecord, TransferColumn>[] = [
  {
    id: "orderNo",
    header: "Order",
    sortable: true,
    resolve: (o) => <span className="font-medium tabular-nums">{o.orderNo}</span>,
    sortValue: (o) => o.orderNo,
    filterValue: (o) => o.orderNo,
  },
  {
    id: "employeeId",
    header: "Employee",
    resolve: (o) => o.employeeId,
    sortValue: (o) => o.employeeId,
    filterValue: (o) => o.employeeId,
  },
  {
    id: "orgUnits",
    header: "Movement",
    resolve: (o) => (
      <span className="text-xs">
        <span className="text-gray-500">{o.fromOrgUnitId}</span>
        {" → "}
        <span className="font-medium">{o.toOrgUnitId}</span>
      </span>
    ),
  },
  {
    id: "effective",
    header: "Effective",
    sortable: true,
    resolve: (o) => <span className="text-xs tabular-nums">{o.effectiveDate}</span>,
    sortValue: (o) => o.effectiveDate,
  },
  {
    id: "status",
    header: "Status",
    sortable: true,
    resolve: (o) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          o.status === "JOINED" || o.status === "APPROVED"
            ? "bg-green-50 text-green-700"
            : o.status === "CANCELLED" || o.status === "RETAINED"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700"
        }`}
      >
        {o.status}
      </span>
    ),
    sortValue: (o) => o.status,
    filterValue: (o) => o.status,
  },
  {
    id: "clearances",
    header: "Clearances",
    resolve: (o) => {
      const total = o.clearanceItems.length;
      const cleared = o.clearanceItems.filter((c) => c.status !== "OPEN").length;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">
            {cleared}/{total}
          </span>
          {total > 0 && (
            <span className="text-[10px] text-gray-400">
              {o.clearanceItems.map((c) => c.code).join(", ")}
            </span>
          )}
        </div>
      );
    },
    sortValue: (o) => {
      const cleared = o.clearanceItems.filter((c) => c.status !== "OPEN").length;
      return o.clearanceItems.length === 0 ? 1 : cleared / o.clearanceItems.length;
    },
  },
];

const FILTER_COLS = [
  { id: "orderNo", label: "Order", type: "text" as const },
  { id: "status", label: "Status", type: "text" as const },
];

/* ── Component ─────────────────────────────────────────────── */

export function TransferOrdersList({ client, refreshToken }: TransferOrdersListProps) {
  const [state, setState] = useState<OrdersState>({ kind: "loading" });
  const [tableState, tableCallbacks] = useDataTable<TransferColumn>(10);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client.listTransferOrders()
      .then((result) => {
        if (mounted) setState(result.items.length === 0 ? { kind: "empty" } : { kind: "ready", orders: result.items });
      })
      .catch((error: unknown) => {
        if (mounted) setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" });
      });
    return () => { mounted = false };
  }, [client, refreshToken]);

  return (
    <section className="record-panel transfer-orders-panel" aria-label="G05 transfer orders">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfer</p>
          <h2>Transfer Orders</h2>
        </div>
        {state.kind === "ready" && (
          <span className="text-xs text-gray-500">{state.orders.length} order{state.orders.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading transfer orders" detail="Fetching G05 transfer orders and clearance progress." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load orders" detail={`Error code ${state.errorCode}.`} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No transfer orders" detail="No transfer orders exist yet. Initiate one above." />
      ) : (
        <DataTable
          items={state.orders}
          columns={TRANSFER_COLUMNS}
          state={tableState}
          callbacks={tableCallbacks}
          filterColumns={FILTER_COLS}
          emptyMessage="No transfer orders."
        />
      )}
    </section>
  );
}
