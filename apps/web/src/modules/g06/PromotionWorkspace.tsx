import { PromotionSliceSummary } from "../../api/hrmsClient";

interface PromotionWorkspaceProps {
  slice: PromotionSliceSummary;
}

export function PromotionWorkspace({ slice }: PromotionWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G06 promotion statutory workspace">
      <header>
        <span className="module-code">G06</span>
        <h2>Promotion and Seniority</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Seniority Lists</dt>
          <dd>{slice.seniorityLists}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd>{slice.promotionOrders}</dd>
        </div>
        <div>
          <dt>MACP</dt>
          <dd>{slice.macpEffected}</dd>
        </div>
        <div>
          <dt>G10 Signals</dt>
          <dd>{slice.paySignalsReady}</dd>
        </div>
      </dl>
      <p className="evidence-line">{`DPC_QUORUM / DPC_RECUSAL / ${slice.srEventType} / G06_PAY_IMPACT_SIGNAL`}</p>
    </article>
  );
}
