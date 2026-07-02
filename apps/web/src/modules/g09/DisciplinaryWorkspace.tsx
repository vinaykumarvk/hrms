import { DisciplinarySliceSummary } from "../../api/hrmsClient";

interface DisciplinaryWorkspaceProps {
  slice: DisciplinarySliceSummary;
}

export function DisciplinaryWorkspace({ slice }: DisciplinaryWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G09 disciplinary statutory workspace">
      <header>
        <span className="module-code">G09</span>
        <h2>Disciplinary Due Process</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Cases</dt>
          <dd>{slice.cases}</dd>
        </div>
        <div>
          <dt>Penalties</dt>
          <dd>{slice.penalties}</dd>
        </div>
        <div>
          <dt>Confidential</dt>
          <dd>{slice.confidential}</dd>
        </div>
        <div>
          <dt>Impact</dt>
          <dd>{slice.impactSignals}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        G09_AUTHORITY_COMPETENCE / {slice.competenceMarker} / CHARGE_MEMO_SERVED / INQUIRY_REPORT / MAJOR_PENALTY / {slice.penaltyEventType} / APPEAL_DECIDED / {slice.appealMarker}
      </p>
    </article>
  );
}
