// PH-07A — G01 satellite persistence (employee_contacts / employee_addresses / employee_dependents),
// the employee_attribute_history spine (FR-EPM-011), and the transactional outbox backbone:
// every satellite mutation appends exactly one outbox event in the same unit of work, and the
// changes feed serves those events in stable cursor order.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph07a-satellites",
    actorUserId: "user-ph07a-satellites",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07a-satellites",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07a-satellites", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function createEmployee(api, idempotencyKey) {
  const response = await call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { firstName: "Meera", lastName: "Nair", orgUnitId: ph03Ids.orgRevenue, dateOfJoining: "2020-01-15" },
  });
  assert.equal(response.status, 201);
  return response.body.employee;
}

test("PH-07A contacts: format validation, one-primary invariant, unique official email, stale row_version", async () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = await createEmployee(api, "idem-ph07a-emp-1");
  const base = `/api/v1/employees/${employee.id}/contacts`;

  const badFormat = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-c0" },
    body: { contactType: "MOBILE", contactValue: "not-a-phone" },
  });
  assert.equal(badFormat.status, 400);

  const first = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-c1" },
    body: { contactType: "MOBILE", contactValue: "+919876543210", isPrimary: true },
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.contact.isPrimary, true);
  assert.equal(first.body.contact.rowVersion, 1);
  assert.equal(first.body.outboxEvent.eventType, "CONTACT_UPDATED");
  // No raw PII in the outbox payload — value never leaves the satellite row.
  assert.equal(first.body.outboxEvent.payload.contactValue, undefined);
  assert.equal(first.body.historyEntry.attributePath, "contact.MOBILE");

  // AC2: marking a new primary auto-demotes the previous primary atomically.
  const second = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-c2" },
    body: { contactType: "MOBILE", contactValue: "+919812345678", isPrimary: true },
  });
  assert.equal(second.status, 201);
  const contacts = await call(api, { method: "GET", path: base });
  assert.equal(contacts.status, 200);
  const primaries = contacts.body.items.filter((item) => item.contactType === "MOBILE" && item.isPrimary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].contactValue, "+919812345678");
  const demoted = contacts.body.items.find((item) => item.id === first.body.contact.id);
  assert.equal(demoted.isPrimary, false);
  assert.equal(demoted.rowVersion, 2, "demotion must bump row_version");

  // AC7: official email is tenant-unique across non-deleted rows -> 409.
  const email = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-c3" },
    body: { contactType: "OFFICIAL_EMAIL", contactValue: "meera.nair@gov.example.in" },
  });
  assert.equal(email.status, 201);
  const duplicate = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-c4" },
    body: { contactType: "OFFICIAL_EMAIL", contactValue: "MEERA.NAIR@gov.example.in" },
  });
  assert.equal(duplicate.status, 409);

  // AC8: every update supplies the expected row_version; mismatch -> STALE_VERSION 409.
  const stale = await call(api, {
    method: "PATCH",
    path: `${base}/${second.body.contact.id}`,
    headers: { "Idempotency-Key": "idem-ph07a-c5" },
    body: { contactValue: "+919800000000", expectedRowVersion: 99 },
  });
  assert.equal(stale.status, 409);
  const updated = await call(api, {
    method: "PATCH",
    path: `${base}/${second.body.contact.id}`,
    headers: { "Idempotency-Key": "idem-ph07a-c6" },
    body: { contactValue: "+919800000000", expectedRowVersion: 1 },
  });
  assert.equal(updated.status, 202);
  assert.equal(updated.body.contact.rowVersion, 2);
});

test("PH-07A addresses: effective-dated transition closes the prior current row", async () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = await createEmployee(api, "idem-ph07a-emp-2");
  const base = `/api/v1/employees/${employee.id}/addresses`;

  const badPincode = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-a0" },
    body: { addressType: "PERMANENT", line1: "12 MG Road", city: "Mysuru", state: "Karnataka", pincode: "57", validFrom: "2020-01-15" },
  });
  assert.equal(badPincode.status, 400);

  const firstAddress = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-a1" },
    body: { addressType: "PERMANENT", line1: "12 MG Road", city: "Mysuru", state: "Karnataka", pincode: "570001", validFrom: "2020-01-15" },
  });
  assert.equal(firstAddress.status, 201);
  assert.equal(firstAddress.body.address.isCurrent, true);
  assert.equal(firstAddress.body.outboxEvent.eventType, "ADDRESS_UPDATED");

  const secondAddress = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-a2" },
    body: { addressType: "PERMANENT", line1: "4 Palace Road", city: "Ballari", state: "Karnataka", pincode: "583101", validFrom: "2026-06-01" },
  });
  assert.equal(secondAddress.status, 201);

  const listed = await call(api, { method: "GET", path: base });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 2);
  const closed = listed.body.items.find((item) => item.id === firstAddress.body.address.id);
  assert.equal(closed.isCurrent, false);
  assert.equal(closed.validTo, "2026-05-31", "prior row must be closed the day before the new valid_from");
  const current = listed.body.items.find((item) => item.id === secondAddress.body.address.id);
  assert.equal(current.isCurrent, true);
  assert.equal(current.validTo, undefined);
});

test("PH-07A dependents: is_minor derivation, single-spouse rule, and P02 national-id masking", async () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = await createEmployee(api, "idem-ph07a-emp-3");
  const base = `/api/v1/employees/${employee.id}/dependents`;

  const spouse = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-d1" },
    body: { fullName: "Anand Nair", relationship: "SPOUSE", dob: "1988-03-02", nationalIdMasked: "XXXX-XXXX-4321" },
  });
  assert.equal(spouse.status, 201);
  assert.equal(spouse.body.dependent.isMinor, false);
  assert.equal(spouse.body.outboxEvent.eventType, "DEPENDENT_UPDATED");
  assert.equal(spouse.body.outboxEvent.payload.nationalIdMasked, undefined, "no national id in the outbox payload");

  const duplicateSpouse = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-d2" },
    body: { fullName: "Second Spouse", relationship: "SPOUSE" },
  });
  assert.equal(duplicateSpouse.status, 409);

  const child = await call(api, {
    method: "POST",
    path: base,
    headers: { "Idempotency-Key": "idem-ph07a-d3" },
    body: { fullName: "Kavya Nair", relationship: "DAUGHTER", dob: "2015-09-20", isLegalHeir: true, heirSuccessionRank: 1 },
  });
  assert.equal(child.status, 201);
  assert.equal(child.body.dependent.isMinor, true);
  assert.equal(child.body.dependent.isLegalHeir, true);

  // P02: national id stays masked without the dedicated field grant, visible with it.
  const maskedList = await call(api, { method: "GET", path: base });
  const maskedSpouse = maskedList.body.items.find((item) => item.relationship === "SPOUSE");
  assert.equal(maskedSpouse.nationalIdMasked, "[HIDDEN]");
  const grantedList = await call(api, { method: "GET", path: base, actor: { fieldGrants: ["employee.dependent.national_id"] } });
  const grantedSpouse = grantedList.body.items.find((item) => item.relationship === "SPOUSE");
  assert.equal(grantedSpouse.nationalIdMasked, "XXXX-XXXX-4321");
});

test("PH-07A attribute-history spine: HIRE seed, governed change rolls the window, P02 masking on contact values", async () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = await createEmployee(api, "idem-ph07a-emp-4");
  const historyPath = `/api/v1/employees/${employee.id}/attribute-history`;

  const seeded = await call(api, { method: "GET", path: historyPath });
  assert.equal(seeded.status, 200);
  const hire = seeded.body.items.find((item) => item.attributePath === "display_name");
  assert.equal(hire.changeReason, "HIRE");
  assert.equal(hire.effectiveFrom, "2020-01-15");
  assert.equal(hire.effectiveTo, undefined);

  // Governed display-name change: PENDING -> APPROVED closes the HIRE window and appends the new version.
  const requested = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/governed-changes`,
    headers: { "Idempotency-Key": "idem-ph07a-h1" },
    body: { newDisplayName: "Meera Menon", reason: "Marriage", effectiveDate: "2026-06-15" },
  });
  assert.equal(requested.status, 201);
  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/governed-changes/${requested.body.request.id}:approve`,
    headers: { "Idempotency-Key": "idem-ph07a-h2" },
    body: {},
  });
  assert.equal(approved.status, 202);

  const history = await call(api, { method: "GET", path: historyPath });
  const windows = history.body.items.filter((item) => item.attributePath === "display_name");
  assert.equal(windows.length, 2, "corrections are recorded as new versions; nothing is overwritten");
  assert.equal(windows[0].effectiveTo, "2026-06-14", "prior window closed the day before the new effective date");
  assert.equal(windows[1].valueText, "Meera Menon");
  assert.equal(windows[1].governedChangeId, requested.body.request.id);
  assert.equal(windows[1].effectiveTo, undefined);

  // Contact values in the spine are masked without the employee.contact field grant.
  await call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/contacts`,
    headers: { "Idempotency-Key": "idem-ph07a-h3" },
    body: { contactType: "MOBILE", contactValue: "+919876500000", isPrimary: true },
  });
  const maskedHistory = await call(api, { method: "GET", path: historyPath });
  const maskedContact = maskedHistory.body.items.find((item) => item.attributePath === "contact.MOBILE");
  assert.equal(maskedContact.valueText, "[HIDDEN]");
  const grantedHistory = await call(api, { method: "GET", path: historyPath, actor: { fieldGrants: ["employee.contact"] } });
  const visibleContact = grantedHistory.body.items.find((item) => item.attributePath === "contact.MOBILE");
  assert.equal(visibleContact.valueText, "+919876500000");
});

test("PH-07A transactional outbox: one event per satellite mutation, cursor-ordered changes feed, stable re-read", async () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = await createEmployee(api, "idem-ph07a-emp-5"); // PROFILE_CREATED (event 1)

  const before = await call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "100" } });
  assert.equal(before.status, 200);
  const baseline = before.body.items.length;

  await call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/contacts`,
    headers: { "Idempotency-Key": "idem-ph07a-o1" },
    body: { contactType: "MOBILE", contactValue: "+919812340001", isPrimary: true },
  });
  await call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/addresses`,
    headers: { "Idempotency-Key": "idem-ph07a-o2" },
    body: { addressType: "PRESENT", line1: "7 Fort Road", city: "Mysuru", state: "Karnataka", pincode: "570004", validFrom: "2026-01-01" },
  });
  await call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/dependents`,
    headers: { "Idempotency-Key": "idem-ph07a-o3" },
    body: { fullName: "Ravi Nair", relationship: "FATHER", dob: "1958-01-30" },
  });

  const after = await call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "100" } });
  assert.equal(after.body.items.length, baseline + 3, "each satellite mutation must produce exactly one outbox event");
  const tail = after.body.items.slice(-3).map((event) => event.eventType);
  assert.deepEqual(tail, ["CONTACT_UPDATED", "ADDRESS_UPDATED", "DEPENDENT_UPDATED"]);

  // Total, stable ordering: sequenceNo strictly increasing across the whole feed.
  const sequences = after.body.items.map((event) => event.sequenceNo);
  assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b));
  assert.equal(new Set(sequences).size, sequences.length);

  // Cursor pagination walks the same feed page by page, in order, without gaps or repeats.
  const paged = [];
  let cursor;
  for (let guard = 0; guard < 10; guard += 1) {
    const query = { limit: "2", ...(cursor ? { cursor } : {}) };
    const page = await call(api, { method: "GET", path: "/api/v1/employees/changes", query });
    assert.equal(page.status, 200);
    assert.equal(page.body.limit, 2);
    paged.push(...page.body.items);
    if (!page.body.next_cursor) {
      break;
    }
    // Stable re-read: the same cursor returns the same page.
    const reread = await call(api, { method: "GET", path: "/api/v1/employees/changes", query });
    assert.deepEqual(reread.body.items, page.body.items);
    cursor = page.body.next_cursor;
  }
  assert.deepEqual(
    paged.map((event) => event.id),
    after.body.items.map((event) => event.id),
    "cursor pages must reassemble the full ordered feed"
  );
});
