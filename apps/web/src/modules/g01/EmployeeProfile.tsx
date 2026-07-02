import { EmployeeSummary } from "../../api/hrmsClient";

export interface EmployeeProfileProps {
  employee: EmployeeSummary;
  fieldGrants: readonly string[];
}

export function EmployeeProfile({ employee, fieldGrants }: EmployeeProfileProps) {
  const canReadSensitiveFields = fieldGrants.includes("employee.pan") || fieldGrants.includes("*");

  return (
    <section className="record-panel" id="employees" aria-label="profile-360">
      <div className="panel-heading">
        <div>
          <h2>Employee profile-360</h2>
          <p>G01 master record with P02 masked PII and fieldGrants evidence.</p>
        </div>
        <strong>{employee.employmentStatus}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Service no</dt>
          <dd>{employee.serviceNo}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{employee.displayName}</dd>
        </div>
        <div>
          <dt>Designation</dt>
          <dd>{employee.designation ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>PII status</dt>
          <dd>{canReadSensitiveFields ? "Visible by fieldGrants" : "masked PII by P02 policy"}</dd>
        </div>
      </dl>
    </section>
  );
}
