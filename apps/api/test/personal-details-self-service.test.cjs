const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "View and update personal details — contact info, address, bank account,
// dependents/nominees, emergency contacts (G01/G02)". Exercised over HTTP against the seeded test
// employees (seedTestEmployees:true), not mocked/hard-coded records, per the goal's data-seeding
// requirement.

function actor(userId, permissions) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["employee"],
    fieldGrants: ["*"],
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  return { services, api, admin, rohan };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g01-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G01 self-service: seeded employee already has contact/address/dependent/nominee/emergency-contact/bank-account rows from the seed", async () => {
  const { services, admin, rohan } = boot();
  assert.ok(services.employeeMaster.listContacts(admin, rohan.id).length >= 1, "seed provides at least one contact");
  assert.ok(services.employeeMaster.listAddresses(admin, rohan.id).length >= 1, "seed provides at least one address");
  assert.equal(services.employeeMaster.listDependents(admin, rohan.id).length, 1, "seed provides one dependent");
  assert.equal(services.nominee.listNominees(admin, rohan.id).length, 1, "seed provides one nominee");
  assert.equal(services.emergencyContact.listEmergencyContacts(admin, rohan.id).length, 1, "seed provides one emergency contact");
  const seededBank = services.bankAccount.listBankAccounts(admin, rohan.id);
  assert.equal(seededBank.length, 1);
  assert.equal(seededBank[0].status, "PENDING", "a freshly seeded bank account starts PENDING, exactly like a real add");
});

test("G01 self-service: the seeded employee can add a second address and a second contact over HTTP", async () => {
  const { api, admin, rohan } = boot();
  const beforeAddresses = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/addresses` })).body.items.length;

  const added = await call(api, actor(rohan.id, ["g01.employee.address.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/addresses`,
    headers: { "Idempotency-Key": "idem-g01-address-001" },
    body: { addressType: "MAILING", line1: "New PG Accommodation", city: "Bengaluru", state: "Karnataka", pincode: "560034", validFrom: "2026-07-13" },
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.address.addressType, "MAILING");

  const afterAddresses = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/addresses` })).body.items.length;
  assert.equal(afterAddresses, beforeAddresses + 1);

  const addedContact = await call(api, actor(rohan.id, ["g01.employee.contact.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/contacts`,
    headers: { "Idempotency-Key": "idem-g01-contact-001" },
    body: { contactType: "ALT_MOBILE", contactValue: "+919000099999", isPrimary: false },
  });
  assert.equal(addedContact.status, 201);
});

test("G01 self-service: nominee share-percent cap is enforced across successive nominees for the same employee", async () => {
  const { api, admin, rohan } = boot();
  // The seed already gives Rohan one 100%-share nominee (see seedTestEmployeeSatellites); a second
  // nominee at any positive share must be rejected by the server, not silently accepted.
  const existing = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/nominees` })).body.items;
  assert.equal(existing[0].sharePct, 100);

  const rejected = await call(api, actor(rohan.id, ["g01.nominee.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/nominees`,
    headers: { "Idempotency-Key": "idem-g01-nominee-001" },
    body: { name: "Second Nominee", benefitType: "GRATUITY", sharePct: 10 },
  });
  assert.equal(rejected.status, 422);
});

test("G01 self-service: emergency-contact priority uniqueness is enforced for the same employee", async () => {
  const { api, admin, rohan } = boot();
  const existing = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/emergency-contacts` })).body.items;
  assert.equal(existing[0].priority, 1);

  const conflict = await call(api, actor(rohan.id, ["g01.emergency_contact.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/emergency-contacts`,
    headers: { "Idempotency-Key": "idem-g01-ec-001" },
    body: { name: "Backup Contact", phone: "+919000088888", priority: 1 },
  });
  assert.equal(conflict.status, 409);

  const ok = await call(api, actor(rohan.id, ["g01.emergency_contact.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/emergency-contacts`,
    headers: { "Idempotency-Key": "idem-g01-ec-002" },
    body: { name: "Backup Contact", phone: "+919000088888", priority: 2 },
  });
  assert.equal(ok.status, 201);
});

test("G01 self-service: a bank account seeded PENDING is approved then penny-drop verified over HTTP", async () => {
  const { api, admin, rohan } = boot();
  const seeded = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/bank-accounts` })).body.items[0];
  assert.equal(seeded.status, "PENDING");

  const financeActor = actor("finance-officer", ["g01.bank.approve", "g01.bank.write"]);
  const approved = await call(api, financeActor, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${seeded.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.bankAccount.status, "APPROVED");
  assert.equal(approved.body.bankAccount.pennyDropStatus, "PENDING", "approval alone does not mark penny-drop verified");

  const pennyDropped = await call(api, financeActor, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${seeded.id}:penny-drop`,
    headers: { "Idempotency-Key": "idem-g01-bank-pennydrop-001" },
    body: { result: "VERIFIED" },
  });
  assert.equal(pennyDropped.status, 202);
  assert.equal(pennyDropped.body.bankAccount.isVerified, true);

  const withoutApprovePermission = actor("random-employee", ["g01.bank.write"]);
  const forbidden = await call(api, withoutApprovePermission, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${seeded.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-approve-002" },
    body: {},
  });
  assert.equal(forbidden.status, 403);
});

test("G01 self-service: the maker of a bank-account submission cannot also approve it (SOD_VIOLATION)", async () => {
  const { api, rohan } = boot();
  const maker = actor("bank-maker", ["g01.bank.write", "g01.bank.approve"]);
  const added = await call(api, maker, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts`,
    headers: { "Idempotency-Key": "idem-g01-bank-sod-001" },
    body: { bankName: "Sample Public Bank", ifsc: "SAMP0004567", accountNumberMasked: "XXXXXXXX5001" },
  });
  assert.equal(added.status, 201);

  const selfApprove = await call(api, maker, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${added.body.bankAccount.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-sod-002" },
    body: {},
  });
  assert.equal(selfApprove.status, 403);
  assert.equal(selfApprove.body.error.code, "SOD_VIOLATION");

  const differentChecker = actor("bank-checker", ["g01.bank.approve"]);
  const approved = await call(api, differentChecker, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${added.body.bankAccount.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-sod-003" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.bankAccount.status, "APPROVED");
});

test("G01 self-service: bank-account wire responses never leak the internal submittedByUserId maker field", async () => {
  const { api, admin, rohan } = boot();
  const added = await call(api, actor("bank-maker-wire-check", ["g01.bank.write"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts`,
    headers: { "Idempotency-Key": "idem-g01-bank-wire-001" },
    body: { bankName: "Sample Public Bank", ifsc: "SAMP0007890", accountNumberMasked: "XXXXXXXX6001" },
  });
  assert.equal(added.status, 201);
  assert.equal("submittedByUserId" in added.body.bankAccount, false, "add response must not leak the maker id");

  const listed = await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/bank-accounts` });
  for (const account of listed.body.items) {
    assert.equal("submittedByUserId" in account, false, "list response must not leak the maker id");
  }

  const approved = await call(api, actor("bank-checker-wire-check", ["g01.bank.approve"]), {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${added.body.bankAccount.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-wire-002" },
    body: {},
  });
  assert.equal("submittedByUserId" in approved.body.bankAccount, false, "approve response must not leak the maker id");
});

test("G01 self-service: updating an approved bank account's IFSC re-enters PENDING for a fresh approval", async () => {
  const { api, admin, rohan } = boot();
  const financeActor = actor("finance-officer", ["g01.bank.approve", "g01.bank.write"]);
  const seeded = (await call(api, admin, { method: "GET", path: `/api/v1/employees/${rohan.id}/bank-accounts` })).body.items[0];
  await call(api, financeActor, {
    method: "POST",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${seeded.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-bank-approve-003" },
    body: {},
  });

  const updated = await call(api, actor(rohan.id, ["g01.bank.write"]), {
    method: "PATCH",
    path: `/api/v1/employees/${rohan.id}/bank-accounts/${seeded.id}`,
    headers: { "Idempotency-Key": "idem-g01-bank-update-001" },
    body: { rowVersion: 2, ifsc: "SAMP0009999" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.bankAccount.status, "PENDING", "a detail change re-enters PENDING even though it was already APPROVED");
});
