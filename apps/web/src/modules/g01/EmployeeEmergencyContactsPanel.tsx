import { FormEvent, useEffect, useState } from "react";
import { EmergencyContactRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee emergency-contacts satellite list. */
type EmergencyContactsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; contacts: EmergencyContactRecord[] };

/** Terminal feedback for the add-emergency-contact submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; name: string }
  | { kind: "error"; errorCode: string };

async function loadEmergencyContacts(client: HrmsClient, employeeId?: string): Promise<EmergencyContactsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const contacts = await client.listEmployeeEmergencyContacts(targetId);
    const active = contacts.items.filter((contact) => contact.status === "ACTIVE");
    return active.length === 0 ? { kind: "empty", employeeId: targetId } : { kind: "ready", employeeId: targetId, contacts: active };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeEmergencyContactsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * G01 emergency-contacts satellite surface (FR-EPM-005): lists GET /employees/{id}/emergency-contacts
 * and adds rows through POST /employees/{id}/emergency-contacts. The server enforces a unique
 * call-order priority per employee; the client surfaces that CONFLICT, not duplicate the check.
 */
export function EmployeeEmergencyContactsPanel({ client, employeeId }: EmployeeEmergencyContactsPanelProps) {
  const [state, setState] = useState<EmergencyContactsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [priority, setPriority] = useState("1");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadEmergencyContacts(client, employeeId).then((next) => {
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
    const priorityValue = Number.parseInt(priority, 10);
    if (!name.trim() || !phone.trim()) {
      setValidationError("Name and phone are both required.");
      return;
    }
    if (!Number.isFinite(priorityValue) || priorityValue < 1) {
      setValidationError("Priority must be a positive whole number.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmergencyContact(state.employeeId, { name: name.trim(), phone: phone.trim(), priority: priorityValue }, crypto.randomUUID())
      .then((result) => {
        setPhase({ kind: "success", name: result.emergencyContact.name });
        setName("");
        setPhone("");
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-emergency-contacts-panel" aria-label="G01 employee emergency contacts">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Emergency Contacts</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading emergency contacts" detail="Fetching the employee emergency-contact satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load emergency contacts"
          detail={`The emergency-contact list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No emergency contacts" detail="No emergency-contact rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee emergency contact rows">
          {state.contacts.map((contact) => (
            <li key={contact.id}>
              <strong>{contact.name}</strong> {contact.phone} (priority {contact.priority})
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add emergency contact form" onSubmit={handleSubmit}>
          <label htmlFor="g01-ec-name">Name</label>
          <input autoComplete="off" id="g01-ec-name" name="name" onChange={(event) => setName(event.target.value)} type="text" value={name} />
          <label htmlFor="g01-ec-phone">Phone</label>
          <input autoComplete="off" id="g01-ec-phone" name="phone" onChange={(event) => setPhone(event.target.value)} type="text" value={phone} />
          <label htmlFor="g01-ec-priority">Priority</label>
          <input id="g01-ec-priority" name="priority" onChange={(event) => setPriority(event.target.value)} type="number" min="1" value={priority} />
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add emergency contact"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the emergency contact failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Emergency contact {phase.name} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
