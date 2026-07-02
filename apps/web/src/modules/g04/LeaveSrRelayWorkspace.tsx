import { LeaveSrRelaySliceSummary } from "../../api/hrmsClient";

export interface LeaveSrRelayWorkspaceProps {
  slice: LeaveSrRelaySliceSummary;
}

export function LeaveSrRelayWorkspace({ slice }: LeaveSrRelayWorkspaceProps) {
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G04 leave service register relay"
      data-relay-owner="G04"
      data-dead-letter-state="DEAD_LETTERED"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G04 Relay</p>
          <h2>Leave to Service Register</h2>
        </div>
        <strong>{slice.relayOwner}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Total</dt>
          <dd>{slice.total}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{slice.posted}</dd>
        </div>
        <div>
          <dt>DLQ</dt>
          <dd>{slice.deadLettered}</dd>
        </div>
        <div>
          <dt>Discarded</dt>
          <dd>{slice.discarded}</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G04 relay evidence">
        <li>Replay and discard require custodian action</li>
        <li>G12 append is idempotent by source reference</li>
      </ul>
    </article>
  );
}
