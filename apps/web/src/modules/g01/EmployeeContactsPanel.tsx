import { FormEvent, useEffect, useState } from "react";
import { EmployeeContactRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee contacts satellite list. */
type ContactsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; contacts: EmployeeContactRecord[] };

/** Terminal feedback for the add-contact submit; client-side validation never leaves the browser. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; contactValue: string }
  | { kind: "error"; errorCode: string };

const CONTACT_TYPES: EmployeeContactRecord["contactType"][] = ["MOBILE", "ALT_MOBILE", "PERSONAL_EMAIL", "OFFICIAL_EMAIL", "LANDLINE"];

async function loadContacts(client: HrmsClient, employeeId?: string): Promise<ContactsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const contacts = await client.listEmployeeContacts(targetId);
    return contacts.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, contacts: contacts.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeContactsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * PH-07E G01 contacts satellite surface: lists GET /employees/{id}/contacts and adds rows through
 * POST /employees/{id}/contacts (PH-07A route) with a fresh Idempotency-Key per attempt.
 */
export function EmployeeContactsPanel({ client, employeeId }: EmployeeContactsPanelProps) {
  const [state, setState] = useState<ContactsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [contactType, setContactType] = useState<EmployeeContactRecord["contactType"]>("MOBILE");
  const [contactValue, setContactValue] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadContacts(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" && state.kind !== "empty") {
      return;
    }
    if (!contactValue.trim()) {
      setValidationError("A contact value is required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmployeeContact(state.employeeId, { contactType, contactValue: contactValue.trim(), isPrimary }, crypto.randomUUID())
      .then((result) => {
        setPhase({ kind: "success", contactValue: result.contact.contactValue });
        setContactValue("");
        setIsPrimary(false);
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-contacts-panel" aria-label="G01 employee contacts">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Contacts</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading contacts" detail="Fetching the employee contact satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load contacts" detail={`The contact list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No contacts" detail="No contact rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee contact rows">
          {state.contacts.map((contact) => (
            <li key={contact.id}>
              <strong>{contact.contactType}</strong> {contact.contactValue}
              {contact.isPrimary ? " (primary)" : ""} — {contact.visibility}
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add contact form" onSubmit={handleSubmit}>
          <label htmlFor="g01-contact-type">Contact type</label>
          <select
            id="g01-contact-type"
            name="contactType"
            onChange={(event) => setContactType(event.target.value as EmployeeContactRecord["contactType"])}
            value={contactType}
          >
            {CONTACT_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label htmlFor="g01-contact-value">Contact value</label>
          <input
            autoComplete="off"
            id="g01-contact-value"
            name="contactValue"
            onChange={(event) => setContactValue(event.target.value)}
            type="text"
            value={contactValue}
          />
          <label htmlFor="g01-contact-primary">
            <input
              checked={isPrimary}
              id="g01-contact-primary"
              name="isPrimary"
              onChange={(event) => setIsPrimary(event.target.checked)}
              type="checkbox"
            />
            Mark as primary
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add contact"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the contact failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Contact {phase.contactValue} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
