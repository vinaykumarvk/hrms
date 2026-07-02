import { AparSliceSummary } from "../../api/hrmsClient";

interface AparWorkspaceProps {
  slice: AparSliceSummary;
}

export function AparWorkspace({ slice }: AparWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G08 APAR statutory workspace">
      <header>
        <span className="module-code">G08</span>
        <h2>APAR and Sealed Cover</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Forms</dt>
          <dd>{slice.forms}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{slice.posted}</dd>
        </div>
        <div>
          <dt>Sealed</dt>
          <dd>{slice.sealedCover}</dd>
        </div>
        <div>
          <dt>Suppressed</dt>
          <dd>{slice.g06FeedSuppressed}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        APAR_FINAL_GRADE / {slice.srEventType} / SEALED_COVER / {slice.sealedMarker} / G08_G06_FEED_SUPPRESSED / {slice.feedMarker}
      </p>
    </article>
  );
}
