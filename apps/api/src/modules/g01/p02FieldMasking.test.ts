// PH-03B P02 field-masking unit tests. Authored as typed cases so the suite typechecks and compiles with the
// project build; executed under `npm test` via apps/api/test/p02FieldMasking.test.cjs. Black-box against the
// EmployeeMasterService serialization contract from the public foundation factory (real ph03 seed fixtures).
import { createFoundationServices } from "../../platform/foundationServices";
import { ph03Ids } from "../../seed/ph03Seed";
import { ActorContext } from "../../platform/types";

interface MaskCase {
  name: string;
  run: () => void;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function actor(fieldGrants: string[]): ActorContext {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-hr-viewer",
    actorUserId: "user-hr-viewer",
    permissions: ["*"],
    roles: ["hr_viewer"],
    fieldGrants,
    correlationId: "corr-ph03b-mask",
  };
}

export const p02FieldMaskingCases: MaskCase[] = [
  {
    name: "PII fields are masked on serialization for an under-privileged viewer (PII ceiling enforced)",
    run: () => {
      const services = createFoundationServices();
      const masked = services.employeeMaster.readProfile(actor([]), ph03Ids.manager);
      // Non-PII scalars remain visible; PII ceiling hides PAN, Aadhaar and social category.
      assertEqual(masked.displayName, "Ananya Rao", "non-PII display name remains visible");
      assertEqual(masked.pan, "[HIDDEN]", "PAN masked without a field grant");
      assertEqual(masked.aadhaarMasked, "[HIDDEN]", "Aadhaar masked without a field grant");
      assertEqual(masked.category, "[HIDDEN]", "social category masked without a field grant");
    },
  },
  {
    name: "the same PII fields are unmasked for a viewer holding the matching field grants",
    run: () => {
      const services = createFoundationServices();
      const visible = services.employeeMaster.readProfile(
        actor(["employee.pan", "employee.aadhaar", "employee.category"]),
        ph03Ids.manager
      );
      assertEqual(visible.pan, "ABCDE1234F", "PAN visible with grant");
      assertEqual(visible.aadhaarMasked, "xxxx-xxxx-1234", "Aadhaar visible with grant");
      assertEqual(visible.category, "OBC", "social category visible with grant");
    },
  },
  {
    name: "field grants are least-privilege: a partial grant unmasks only the granted field",
    run: () => {
      const services = createFoundationServices();
      const partial = services.employeeMaster.readProfile(actor(["employee.pan"]), ph03Ids.manager);
      assertEqual(partial.pan, "ABCDE1234F", "granted PAN is unmasked");
      assertEqual(partial.aadhaarMasked, "[HIDDEN]", "ungranted Aadhaar stays masked");
      assertEqual(partial.category, "[HIDDEN]", "ungranted category stays masked");
    },
  },
];
