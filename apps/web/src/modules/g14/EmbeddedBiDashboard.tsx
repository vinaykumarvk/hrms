import { useEffect, useState } from "react";
import { BiKpiTile, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-34A — G14 embedded BI dashboard (FR-15/16, mobile-friendly).
 * A compact KPI board that fetches BI tiles via the injected client and supports a mobile/desktop
 * viewport toggle. Renders canonical loading/error/empty states.
 */

type BoardState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; tiles: BiKpiTile[] };

export interface EmbeddedBiDashboardProps {
  client: HrmsClient;
}

export function EmbeddedBiDashboard({ client }: EmbeddedBiDashboardProps) {
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client
      .listBiKpis()
      .then((page) => {
        if (!live) return;
        setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", tiles: page.items });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setState({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
      });
    return () => {
      live = false;
    };
  }, [client, refreshToken]);

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading BI dashboard" detail="Fetching KPI tiles." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load KPIs" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No KPIs published" detail="The analytics marts have no published KPIs." />;

  return (
    <section aria-label="Embedded BI dashboard" data-viewport={viewport}>
      <header>
        <h3>Executive KPI board</h3>
        <button type="button" onClick={() => setViewport((v) => (v === "desktop" ? "mobile" : "desktop"))}>
          {viewport === "desktop" ? "Switch to mobile" : "Switch to desktop"}
        </button>
        <button type="button" onClick={() => setRefreshToken((t) => t + 1)}>Refresh</button>
      </header>
      <ul className={`bi-tiles bi-${viewport}`}>
        {state.tiles.map((t) => (
          <li key={t.kpiCode} aria-label={t.label}>
            <span className="bi-label">{t.label}</span>
            <span className="bi-value">{t.value.toLocaleString()}</span>
            <span className={`bi-trend bi-trend-${t.trend.toLowerCase()}`}>{t.trend}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
