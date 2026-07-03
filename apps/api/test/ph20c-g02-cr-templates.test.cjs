// PH-20C — G02 change-request templates (FR-014).
//   change_request_templates capture reusable fields; starting from a template pre-fills items
//   filtered to allowedFields (P02); a deactivated template cannot start a request.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const HR = "user-ph20c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: HR,
    actorUserId: HR,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph20c",
    ...extra,
  };
}

test("G02 change_request_templates: start-from-template pre-fills allowed fields and drops the rest", () => {
  const s = createFoundationServices();
  const tpl = s.changeRequestTemplate.createTemplate(actor(), {
    templateCode: "ADDR-CHANGE",
    name: "Address change",
    fields: [
      { fieldCode: "addressLine1", defaultValue: "" },
      { fieldCode: "city" },
      { fieldCode: "aadhaarNumber" }, // not permitted for self-service
    ],
  });
  const prefill = s.changeRequestTemplate.startFromTemplate(actor(), tpl.id, { allowedFields: ["addressLine1", "city"] });
  assert.deepEqual(prefill.items.map((i) => i.fieldCode), ["addressLine1", "city"]);
  assert.deepEqual(prefill.droppedFields, ["aadhaarNumber"]);
});

test("G02 change_request_templates: a deactivated template cannot start a request", () => {
  const s = createFoundationServices();
  const tpl = s.changeRequestTemplate.createTemplate(actor(), {
    templateCode: "NAME-CHANGE",
    name: "Name change",
    fields: [{ fieldCode: "displayName" }],
  });
  s.changeRequestTemplate.deactivateTemplate(actor(), tpl.id);
  assert.throws(
    () => s.changeRequestTemplate.startFromTemplate(actor(), tpl.id, { allowedFields: ["displayName"] }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
