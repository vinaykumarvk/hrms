import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmployeeContactRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable, DataTableState, DataTableCallbacks } from "../../lib/useDataTable";

/* ── View / Submit state ──────────────────────────────────── */

type ContactsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; contacts: EmployeeContactRecord[] };

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; contactValue: string }
  | { kind: "error"; errorCode: string };

const CONTACT_TYPES: EmployeeContactRecord["contactType"][] = [
  "MOBILE", "ALT_MOBILE", "PERSONAL_EMAIL", "OFFICIAL_EMAIL", "LANDLINE",
];

/* ── Data table columns ───────────────────────────────────── */

type ContactColumn = "type" | "value" | "primary" | "visibility";

const CONTACT_COLUMNS: DataTableColumnDef<EmployeeContactRecord, ContactColumn>[] = [
  {
    id: "type",
    header: "Type",
    sortable: true,
    resolve: (c) => <span className="font-medium">{c.contactType}</span>,
    sortValue: (c) => c.contactType,
    filterValue: (c) => c.contactType,
  },
  {
    id: "value",
    header: "Contact",
    sortable: true,
    resolve: (c) => c.contactValue,
    sortValue: (c) => c.contactValue,
    filterValue: (c) => c.contactValue,
  },
  {
    id: "primary",
    header: "Primary",
    resolve: (c) => (c.isPrimary ? "✓" : "—"),
    sortValue: (c) => (c.isPrimary ? 1 : 0),
    filterValue: (c) => (c.isPrimary ? "yes" : "no"),
    className: "text-center",
  },
  {
    id: "visibility",
    header: "Visibility",
    sortable: true,
    resolve: (c) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
          c.visibility === "PUBLIC"
            ? "bg-green-50 text-green-700"
            : c.visibility === "RESTRICTED" || c.visibility === "PRIVATE"
              ? "bg-red-50 text-red-700"
              : "bg-gray-50 text-gray-700"
        }`}
      >
        {c.visibility}
      </span>
    ),
    sortValue: (c) => c.visibility,
    filterValue: (c) => c.visibility,
  },
];

const FILTER_COLUMNS = [
  { id: "type", label: "Type", type: "text" as const },
  { id: "value", label: "Contact", type: "text" as const },
];

/* ── Loader ───────────────────────────────────────────────── */

async function loadContacts(client: HrmsClient, employeeId?: string): Promise<ContactsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) return { kind: "error", errorCode: "NOT_FOUND" };
    const contacts = await client.listEmployeeContacts(targetId);
    return contacts.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, contacts: contacts.items };
  } catch (error) {
    return {
      kind: "error",
      errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR",
    };
  }
}

/* ── Component ────────────────────────────────────────────── */

export interface EmployeeContactsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * G01 contacts satellite surface. Uses the DataTable component for sortable,
 * filterable, paginated display of employee contact rows.
 */
export function EmployeeContactsPanel({ client, employeeId }: EmployeeContactsPanelProps) {
  const [state, setState] = useState<ContactsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);

  // Add-contact form
  const [contactType, setContactType] = useState<EmployeeContactRecord["contactType"]>("MOBILE");
  const [contactValue, setContactValue] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  // Data table state
  const [tableState, tableCallbacks] = useDataTable<ContactColumn>();

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadContacts(client, employeeId).then((next) => {
      if (mounted) setState(next);
    });
    return () => { mounted = false };
  }, [client, employeeId, refreshToken]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" && state.kind !== "empty") return;
    if (!contactValue.trim()) {
      setValidationError("A contact value is required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmployeeContact(
        state.employeeId,
        { contactType, contactValue: contactValue.trim(), isPrimary },
        crypto.randomUUID(),
      )
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
  const contacts = state.kind === "ready" ? state.contacts : [];

  return (
    <section className="record-panel g01-contacts-panel" aria-label="G01 employee contacts">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Contacts</h2>
        </div>
        {state.kind === "ready" && (
          <span className="text-xs text-gray-500">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading contacts" detail="Fetching the employee contact satellite rows." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load contacts" detail={`The contact list failed with error code ${state.errorCode}.`} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No contacts" detail="No contact rows are recorded for this employee yet." />
      ) : (
        <DataTable
          items={contacts}
          columns={CONTACT_COLUMNS}
          state={tableState}
          callbacks={tableCallbacks}
          filterColumns={FILTER_COLUMNS}
          emptyMessage="No contacts recorded."
          filteredEmptyMessage="No contacts match the current filters."
        />
      )}

      {/* Add-contact form */}
      {(state.kind === "ready" || state.kind === "empty") && (
        <form aria-label="Add contact form" onSubmit={handleSubmit}>
          <label htmlFor="g01-contact-type">Contact type</label>
          <select
            id="g01-contact-type"
            name="contactType"
            onChange={(event) => setContactType(event.target.value as EmployeeContactRecord["contactType"])}
            value={contactType}
          >
            {CONTACT_TYPES.map((option) => (<option key={option} value={option}>{option}</option>))}
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
            {" "}Mark as primary
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add contact"}
          </button>
        </form>
      )}

      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the contact failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Contact {phase.contactValue} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
