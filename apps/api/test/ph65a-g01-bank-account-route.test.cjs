const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph65a",
    actorUserId: "user-ph65a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph65a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph65a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function addAccount(api, key, body) {
  return call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts`, headers: { "Idempotency-Key": key }, body });
}

test("PH-65A G01 bank account: VAL-IFSC + PENDING on add; at most one primary-salary account", () => {
  const api = createFoundationApi(createFoundationServices());

  const badIfsc = addAccount(api, "ba-bad", { bankName: "SBI", ifsc: "NOTVALID", accountNumberMasked: "XXXX1234", isPrimarySalary: true });
  assert.equal(badIfsc.status, 422);
  assert.equal(badIfsc.body.error.code, "VAL-IFSC");

  const first = addAccount(api, "ba-1", { bankName: "SBI", ifsc: "SBIN0001234", accountNumberMasked: "XXXX1234", isPrimarySalary: true });
  assert.equal(first.status, 201);
  assert.equal(first.body.bankAccount.status, "PENDING");
  assert.equal(first.body.bankAccount.isPrimarySalary, true);

  // A second primary-salary account demotes the first.
  const second = addAccount(api, "ba-2", { bankName: "HDFC", ifsc: "HDFC0000123", accountNumberMasked: "XXXX9999", isPrimarySalary: true });
  assert.equal(second.status, 201);
  const list = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts` });
  assert.equal(list.body.items.filter((a) => a.lifecycle === "ACTIVE" && a.isPrimarySalary).length, 1);
});

test("PH-65A G01 bank account: approve lifecycle + penny-drop tri-state", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = addAccount(api, "bl-1", { bankName: "SBI", ifsc: "SBIN0001234", accountNumberMasked: "XXXX1234" });
  const id = created.body.bankAccount.id;

  const approved = call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts/${id}:approve`, headers: { "Idempotency-Key": "bl-a" }, body: {} });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.bankAccount.status, "APPROVED");

  // Re-approving an APPROVED account fails closed.
  const reapprove = call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts/${id}:approve`, headers: { "Idempotency-Key": "bl-a2" }, body: {} });
  assert.equal(reapprove.status, 412);

  const penny = call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts/${id}:penny-drop`, headers: { "Idempotency-Key": "bl-p" }, body: { result: "VERIFIED" } });
  assert.equal(penny.status, 202);
  assert.equal(penny.body.bankAccount.pennyDropStatus, "VERIFIED");
  assert.equal(penny.body.bankAccount.isVerified, true);
});

test("PH-65A G01 bank account: an account-detail change re-enters PENDING (fresh approval required)", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = addAccount(api, "bu-1", { bankName: "SBI", ifsc: "SBIN0001234", accountNumberMasked: "XXXX1234" });
  const id = created.body.bankAccount.id;
  call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts/${id}:approve`, headers: { "Idempotency-Key": "bu-a" }, body: {} });

  const read = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts` });
  const cur = read.body.items.find((a) => a.id === id);
  assert.equal(cur.status, "APPROVED");

  const updated = call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/bank-accounts/${id}`,
    headers: { "Idempotency-Key": "bu-u" },
    body: { rowVersion: cur.rowVersion, accountNumberMasked: "XXXX5678" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.bankAccount.status, "PENDING");
  assert.equal(updated.body.bankAccount.isVerified, false);
});
