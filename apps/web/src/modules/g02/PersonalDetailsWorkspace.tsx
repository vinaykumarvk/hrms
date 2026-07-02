import { PersonalDetailsSliceSummary } from "../../api/hrmsClient";

export interface PersonalDetailsWorkspaceProps {
  slice: PersonalDetailsSliceSummary;
}

export function PersonalDetailsWorkspace({ slice }: PersonalDetailsWorkspaceProps) {
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G02 personal details transaction"
      data-workflow-code="WF-G02-PERSONAL-DETAILS"
      data-owner-module="G01"
      data-evidence-module="G13"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>Personal Details Workflow</h2>
        </div>
        <strong>{slice.status}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Request</dt>
          <dd>{slice.requestNo}</dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>{slice.fieldCode}</dd>
        </div>
        <div>
          <dt>Routing</dt>
          <dd>{slice.sensitivity}</dd>
        </div>
        <div>
          <dt>SR owner</dt>
          <dd>{slice.ownerModule}</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G02 evidence">
        <li>{slice.documentCount} G13 evidence document</li>
        <li>Commit and reversal route through G01</li>
      </ul>
    </article>
  );
}
