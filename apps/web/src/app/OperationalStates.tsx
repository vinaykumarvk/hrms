export type OperationalStateKind = "loading" | "empty" | "error" | "no-permission" | "partial-data";

export interface OperationalStateProps {
  kind: OperationalStateKind;
  title: string;
  detail: string;
}

export function OperationalState({ kind, title, detail }: OperationalStateProps) {
  return (
    <section className="operational-state" data-state={kind} aria-live={kind === "error" ? "assertive" : "polite"}>
      <p className="state-label">{kind}</p>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

export function StandardOperationalStates() {
  return (
    <div className="state-grid" aria-label="Operational states">
      <OperationalState kind="loading" title="Loading workspace" detail="Fetching the latest task and record data." />
      <OperationalState kind="empty" title="No records" detail="The current filter has no records to review." />
      <OperationalState kind="error" title="Could not load data" detail="The request failed with a canonical error envelope." />
      <OperationalState kind="no-permission" title="No permission" detail="This route guard hides controls outside the user entitlement." />
      <OperationalState kind="partial-data" title="Partial data" detail="Some related evidence is still being retrieved." />
    </div>
  );
}
