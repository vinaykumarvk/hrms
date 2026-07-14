import { FormEvent, useEffect, useState } from "react";
import { EmployeeAddressRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee addresses satellite list. */
type AddressesState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; addresses: EmployeeAddressRecord[] };

/** Terminal feedback for the add-address submit; client-side validation never leaves the browser. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; line1: string }
  | { kind: "error"; errorCode: string };

const ADDRESS_TYPES: EmployeeAddressRecord["addressType"][] = ["PERMANENT", "PRESENT", "MAILING", "OVERSEAS"];

async function loadAddresses(client: HrmsClient, employeeId?: string): Promise<AddressesState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const addresses = await client.listEmployeeAddresses(targetId);
    return addresses.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, addresses: addresses.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeAddressesPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * G01 addresses satellite surface: lists GET /employees/{id}/addresses and adds rows through
 * POST /employees/{id}/addresses with a fresh Idempotency-Key per attempt.
 */
export function EmployeeAddressesPanel({ client, employeeId }: EmployeeAddressesPanelProps) {
  const [state, setState] = useState<AddressesState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [addressType, setAddressType] = useState<EmployeeAddressRecord["addressType"]>("PRESENT");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state_, setState_] = useState("");
  const [pincode, setPincode] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAddresses(client, employeeId).then((next) => {
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
    if (!line1.trim() || !city.trim() || !state_.trim() || !pincode.trim() || !validFrom) {
      setValidationError("Line 1, city, state, pincode, and valid-from date are all required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmployeeAddress(
        state.employeeId,
        { addressType, line1: line1.trim(), city: city.trim(), state: state_.trim(), pincode: pincode.trim(), validFrom },
        crypto.randomUUID()
      )
      .then((result) => {
        setPhase({ kind: "success", line1: result.address.line1 });
        setLine1("");
        setCity("");
        setState_("");
        setPincode("");
        setValidFrom("");
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-addresses-panel" aria-label="G01 employee addresses">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Addresses</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading addresses" detail="Fetching the employee address satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load addresses" detail={`The address list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No addresses" detail="No address rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee address rows">
          {state.addresses.map((address) => (
            <li key={address.id}>
              <strong>{address.addressType}</strong> {address.line1}, {address.city}, {address.state} {address.pincode}
              {address.isCurrent ? " (current)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add address form" onSubmit={handleSubmit}>
          <label htmlFor="g01-address-type">Address type</label>
          <select
            id="g01-address-type"
            name="addressType"
            onChange={(event) => setAddressType(event.target.value as EmployeeAddressRecord["addressType"])}
            value={addressType}
          >
            {ADDRESS_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label htmlFor="g01-address-line1">Line 1</label>
          <input autoComplete="off" id="g01-address-line1" name="line1" onChange={(event) => setLine1(event.target.value)} type="text" value={line1} />
          <label htmlFor="g01-address-city">City</label>
          <input autoComplete="off" id="g01-address-city" name="city" onChange={(event) => setCity(event.target.value)} type="text" value={city} />
          <label htmlFor="g01-address-state">State</label>
          <input autoComplete="off" id="g01-address-state" name="state" onChange={(event) => setState_(event.target.value)} type="text" value={state_} />
          <label htmlFor="g01-address-pincode">Pincode</label>
          <input autoComplete="off" id="g01-address-pincode" name="pincode" onChange={(event) => setPincode(event.target.value)} type="text" value={pincode} />
          <label htmlFor="g01-address-valid-from">Valid from</label>
          <input id="g01-address-valid-from" name="validFrom" onChange={(event) => setValidFrom(event.target.value)} type="date" value={validFrom} />
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add address"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the address failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Address at {phase.line1} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
