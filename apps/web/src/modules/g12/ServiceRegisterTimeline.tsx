export interface ServiceRegisterTimelineItem {
  id: string;
  sequenceNo: number;
  eventTypeCode: string;
  eventDate: string;
  sourceModule: string;
  entryHash: string;
  previousHash: string;
}

export interface ServiceRegisterTimelineProps {
  items: readonly ServiceRegisterTimelineItem[];
}

export function ServiceRegisterTimeline({ items }: ServiceRegisterTimelineProps) {
  return (
    <section className="record-panel" id="service-register" aria-label="Service Register timeline">
      <div className="panel-heading">
        <div>
          <h2>Service Register</h2>
          <p>G12 append-only sequence, hash chain, and provenance view.</p>
        </div>
        <strong>{items.length} events</strong>
      </div>
      <ol className="sr-timeline">
        {items.map((item) => (
          <li key={item.id}>
            <span>sequence {item.sequenceNo}</span>
            <strong>{item.eventTypeCode}</strong>
            <small>
              {item.eventDate} · {item.sourceModule} provenance · hash {item.entryHash.slice(0, 8)} · previous {item.previousHash.slice(0, 8)}
            </small>
          </li>
        ))}
      </ol>
      <p className="record-note">No edit or delete affordance is exposed; the timeline is append-only.</p>
    </section>
  );
}
