// PH-23A — G04 X.3 outbound integration framework (FR-16).
//   An outbound connector sends a versioned payload through an injectable transport, classifies
//   failures (permanent vs retryable), retries retryable ones, and trips a circuit breaker to OPEN
//   after consecutive failures — while OPEN, sends are short-circuited (fail closed).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OPS = "user-ph23a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OPS,
    actorUserId: OPS,
    permissions: ["*"],
    roles: ["integ_ops"],
    fieldGrants: ["*"],
    correlationId: "corr-ph23a",
    ...extra,
  };
}

// A scriptable transport whose result is controlled per test.
function scriptedServices(script) {
  const state = { mode: "ok" };
  const transport = {
    send() {
      if (state.mode === "ok") return { ok: true };
      if (state.mode === "permanent") return { ok: false, permanent: true };
      return { ok: false }; // retryable
    },
  };
  const services = createFoundationServices({ g04OutboundTransport: transport });
  return { services, setMode: (m) => (state.mode = m) };
}

test("G04 X.3 outbound: a delivered send resets the breaker; a permanent failure dead-letters", async () => {
  const { services, setMode } = scriptedServices();
  const conn = services.outboundIntegration.registerConnector(actor(), { name: "SR-BUS", endpoint: "https://x3/sr", payloadVersion: 2, failureThreshold: 2, maxAttempts: 2 });
  const ok = services.outboundIntegration.send(actor(), conn.id, { payload: { hello: "world" } });
  assert.equal(ok.outcome, "DELIVERED");
  setMode("permanent");
  const dead = services.outboundIntegration.send(actor(), conn.id, { payload: { x: 1 } });
  assert.equal(dead.outcome, "DEAD_LETTERED");
});

test("G04 X.3 outbound: consecutive retryable failures trip the circuit breaker OPEN and short-circuit", async () => {
  const { services, setMode } = scriptedServices();
  const conn = services.outboundIntegration.registerConnector(actor(), { name: "PDA", endpoint: "https://x3/pda", failureThreshold: 2, maxAttempts: 1 });
  setMode("retryable");
  services.outboundIntegration.send(actor(), conn.id, { payload: {} }); // failure 1
  services.outboundIntegration.send(actor(), conn.id, { payload: {} }); // failure 2 -> breaker OPEN
  const openConn = services.outboundIntegration.getConnector(actor(), conn.id);
  assert.equal(openConn.breakerState, "OPEN");
  // Further sends are short-circuited while OPEN.
  assert.throws(
    () => services.outboundIntegration.send(actor(), conn.id, { payload: {} }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});

test("G04 X.3 outbound: conformance self-test passes on the happy path", async () => {
  const { services } = scriptedServices();
  const conn = services.outboundIntegration.registerConnector(actor(), { name: "CONF", endpoint: "https://x3/conf" });
  assert.equal(services.outboundIntegration.runConformance(actor(), conn.id).passed, true);
});
