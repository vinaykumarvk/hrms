import { TransferSliceSummary } from "../../api/hrmsClient";

export interface TransferWorkspaceProps {
  slice: TransferSliceSummary;
}

export function TransferWorkspace({ slice }: TransferWorkspaceProps) {
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G05 transfer vertical slice"
      data-workflow-resolver="POSITION_AUTHORITY"
      data-clearance-pattern="PARALLEL_ALL_OF"
      data-deemed-state="DEEMED_CLEARED"
      data-sr-event="TRANSFER_JOINED"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfer</p>
          <h2>Relieving & Joining Proof</h2>
        </div>
        <strong>{slice.status}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Order</dt>
          <dd>{slice.orderNo}</dd>
        </div>
        <div>
          <dt>Resolver</dt>
          <dd>{slice.resolver}</dd>
        </div>
        <div>
          <dt>Clearance</dt>
          <dd>{slice.clearancePattern}</dd>
        </div>
        <div>
          <dt>Documents</dt>
          <dd>{slice.documentCount} G13 records</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G05 transfer evidence">
        {slice.clearances.map((clearance) => (
          <li key={clearance.code}>
            {clearance.code}: {clearance.status}
          </li>
        ))}
        <li>G12 event {slice.srEventType}</li>
      </ul>
    </article>
  );
}
