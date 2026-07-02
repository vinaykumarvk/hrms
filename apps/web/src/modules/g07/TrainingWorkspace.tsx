import { TrainingSliceSummary } from "../../api/hrmsClient";

interface TrainingWorkspaceProps {
  slice: TrainingSliceSummary;
}

export function TrainingWorkspace({ slice }: TrainingWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G07 training statutory workspace">
      <header>
        <span className="module-code">G07</span>
        <h2>Training and Certification</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Sessions</dt>
          <dd>{slice.sessions}</dd>
        </div>
        <div>
          <dt>Approved</dt>
          <dd>{slice.approved}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{slice.completed}</dd>
        </div>
        <div>
          <dt>SR Posted</dt>
          <dd>{slice.srPosted}</dd>
        </div>
      </dl>
      <p className="evidence-line">{`WF-G07-NOMINATION / TRAINING_CERTIFICATION_POSTED / ${slice.srEventType}`}</p>
    </article>
  );
}
