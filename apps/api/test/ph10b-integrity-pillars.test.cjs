// PH-10B: G12 integrity pillars on the PH-10A SHA-256 substrate (BRD G12 FR-04/07/10/17) —
// integrity verify endpoint + JOB-G12-INTEGRITY on the same code path with a NEGATIVE
// tamper test (mutated chain copy -> verify FAILs at the offending sequence number), a
// REAL Merkle root over per-employee chain heads behind an injectable RFC 3161 TSA fake
// (recompute + sensitivity asserted), the completeness gap register (JOB-G12-GAPSCAN ->
// GAP_FLAGGED, lifecycle without deletes), custodian attestation, and certified extracts
// with P02 fail-closed redaction. Executed against the compiled dist under `npm test`.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  computeMerkleRoot,
  chainHeadLeaf,
  verifyEntryChain,
  verifyStatusChain,
  ph03Ids,
  sha256Hex,
  stableStringify,
} = require("../../../dist/apps/api/src");

const GENESIS_HASH = "0".repeat(64);

function actor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph10b",
    ...extra,
  };
}

function fakeTsa() {
  const calls = [];
  return {
    calls,
    timestamp(digestHex) {
      calls.push(digestHex);
      return { token: `fake-tsa-token:${digestHex}`, authority: "FAKE-TSA policy 1.2.3", timestampedAt: "2026-07-01T00:00:00.000Z" };
    },
  };
}

function ingest(services, scope, employeeId, seq, eventTypeCode = "IDENTITY_CHANGE", payload = undefined) {
  return services.serviceRegister.ingest(scope, `idem-ph10b-${employeeId}-${seq}`, {
    sourceModule: "G01",
    sourceReferenceId: `employee:ph10b:${employeeId}:${seq}`,
    sourceEventVersion: 1,
    employeeId,
    eventTypeCode,
    eventDate: `2026-0${Math.min(seq, 9)}-15`,
    factKey: `EMP:${employeeId}|${eventTypeCode}|${seq}`,
    payload: payload ?? { displayName: `Person ${seq}`, basicPay: 56100 + seq },
    documentIds: [],
  }).event;
}

test("PH-10B FR-04 verify endpoint recomputes both chains and reports OK; JOB-G12-INTEGRITY drives the same path", async () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10b-verify");
  const api = createFoundationApi(services);
  ingest(services, scope, "emp-ph10b-0001", 1);
  ingest(services, scope, "emp-ph10b-0001", 2);
  ingest(services, scope, "emp-ph10b-0001", 3);

  // Endpoint: recompute-from-content verification of the intact chain is OK.
  const response = await api.dispatch({
    method: "GET",
    path: "/api/v1/sr/employees/emp-ph10b-0001/integrity/verify",
    headers: { "X-Correlation-Id": "corr-ph10b" },
    actor: actor("user-ph10b-verify"),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.result, "OK");
  assert.equal(response.body.entryChain.result, "OK");
  assert.equal(response.body.entryChain.linksChecked, 3);
  assert.equal(response.body.statusChain.result, "OK");

  // JOB-G12-INTEGRITY: the scheduled recompute job registers by that literal id and
  // reuses the same verify code path over every employee chain.
  const jobResult = services.srIntegrity.runIntegrityJob(scope, "run-ph10b-integrity-1");
  assert.equal(jobResult.run.jobId, "JOB-G12-INTEGRITY");
  assert.equal(jobResult.run.status, "SUCCEEDED");
  assert.equal(jobResult.result, "OK");
  assert.equal(jobResult.employeesChecked >= 1, true);
  assert.deepEqual(jobResult.failures, []);
});

test("PH-10B NEGATIVE tamper detection: a mutated copy of the chain FAILs verify at the offending sequence number", async () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10b-tamper");
  ingest(services, scope, "emp-ph10b-0002", 1);
  ingest(services, scope, "emp-ph10b-0002", 2);
  ingest(services, scope, "emp-ph10b-0002", 3);

  const chain = services.serviceRegister.getEntryChain(scope, "emp-ph10b-0002");
  assert.equal(verifyEntryChain(chain).result, "OK");

  // Tamper with the stored CONTENT of link 2 on a copy: verify recomputes hashes from
  // content (never stored-hash-vs-stored-hash), so the forgery must be detected.
  const tamperedContent = chain.map((event) => ({ ...event, payload: { ...event.payload } }));
  tamperedContent[1].payload.basicPay = 999999;
  const contentVerdict = verifyEntryChain(tamperedContent);
  assert.equal(contentVerdict.result, "FAIL");
  assert.equal(contentVerdict.firstFailure.chain, "ENTRY");
  assert.equal(contentVerdict.firstFailure.sequenceNo, 2);
  assert.equal(contentVerdict.firstFailure.reason, "HASH_MISMATCH");

  // Tamper with the chain LINK of entry 3: first broken link reported at sequence 3.
  const tamperedLink = chain.map((event) => ({ ...event }));
  tamperedLink[2].previousHash = "f".repeat(64);
  const linkVerdict = verifyEntryChain(tamperedLink);
  assert.equal(linkVerdict.result, "FAIL");
  assert.equal(linkVerdict.firstFailure.sequenceNo, 3);
  assert.equal(linkVerdict.firstFailure.reason, "LINK_BROKEN");

  // The sr_status_events sub-chain is verified the same way: a mutated status FAILs.
  const statusChain = services.serviceRegister.getStatusChain(scope, "emp-ph10b-0002");
  assert.equal(verifyStatusChain(statusChain).result, "OK");
  const tamperedStatus = statusChain.map((row) => ({ ...row }));
  tamperedStatus[0].toValue = "SUPERSEDED";
  const statusVerdict = verifyStatusChain(tamperedStatus);
  assert.equal(statusVerdict.result, "FAIL");
  assert.equal(statusVerdict.firstFailure.chain, "STATUS");
  assert.equal(statusVerdict.firstFailure.sequenceNo, 1);
  assert.equal(statusVerdict.firstFailure.reason, "HASH_MISMATCH");

  // The live ledger remains intact — only the copy was mutated.
  assert.equal(services.srIntegrity.verifyEmployee(scope, "emp-ph10b-0002").result, "OK");
});

test("PH-10B Merkle root is real pairwise SHA-256 with odd-node promotion: recomputable and head-sensitive", async () => {
  const leafA = sha256Hex("leaf-a");
  const leafB = sha256Hex("leaf-b");
  const leafC = sha256Hex("leaf-c");
  const sorted = [leafA, leafB, leafC].sort();

  // Recompute the root by hand: pair left-to-right, promote the odd node unchanged.
  const manualRoot = sha256Hex(sha256Hex(sorted[0] + sorted[1]) + sorted[2]);
  assert.equal(computeMerkleRoot([leafA, leafB, leafC]), manualRoot);
  // Deterministic under input order (leaves are sorted before pairing).
  assert.equal(computeMerkleRoot([leafC, leafA, leafB]), manualRoot);
  // Sensitivity: changing any single leaf changes the root.
  assert.notEqual(computeMerkleRoot([sha256Hex("leaf-a-forged"), leafB, leafC]), manualRoot);
  // Degenerate cases: single leaf is its own root; empty ledger anchors to genesis.
  assert.equal(computeMerkleRoot([leafA]), leafA);
  assert.equal(computeMerkleRoot([]), GENESIS_HASH);
});

test("PH-10B JOB-G12-ANCHOR persists a real Merkle anchor over per-employee chain heads behind the TSA seam", async () => {
  const tsa = fakeTsa();
  const services = createFoundationServices({ g12TimestampAuthority: tsa });
  const scope = actor("user-ph10b-anchor");
  ingest(services, scope, "emp-ph10b-0003", 1);
  ingest(services, scope, "emp-ph10b-0003", 2);
  ingest(services, scope, "emp-ph10b-0004", 1);

  const first = services.srIntegrity.runAnchorJob(scope, "run-ph10b-anchor-1", { periodFrom: "2026-01-01T00:00:00.000Z", periodTo: "2026-06-30T23:59:59.000Z" });
  assert.equal(first.run.jobId, "JOB-G12-ANCHOR");
  assert.equal(first.anchor.leafCount, 2);
  assert.equal(first.anchor.prevAnchorHash, GENESIS_HASH);

  // The persisted root is recomputable from the live per-employee {content head, status head} leaves.
  const expectedLeaves = ["emp-ph10b-0003", "emp-ph10b-0004"].map((employeeId) => {
    const entries = services.serviceRegister.getEntryChain(scope, employeeId);
    const statuses = services.serviceRegister.getStatusChain(scope, employeeId);
    return chainHeadLeaf({
      employeeId,
      entryHeadHash: entries[entries.length - 1].entryHash,
      statusHeadHash: statuses[statuses.length - 1].statusHash,
    });
  });
  assert.equal(first.anchor.merkleRoot, computeMerkleRoot(expectedLeaves));

  // RFC 3161 TSA sits behind the injectable interface: the fake was called with the root.
  assert.equal(tsa.calls.includes(first.anchor.merkleRoot), true);
  assert.equal(first.anchor.tsaTimestampToken, `fake-tsa-token:${first.anchor.merkleRoot}`);
  assert.equal(first.anchor.tsaAuthority, "FAKE-TSA policy 1.2.3");

  // A change to any single chain head changes the next anchor's root, and anchors chain.
  ingest(services, scope, "emp-ph10b-0004", 2);
  const second = services.srIntegrity.runAnchorJob(scope, "run-ph10b-anchor-2");
  assert.notEqual(second.anchor.merkleRoot, first.anchor.merkleRoot);
  assert.equal(second.anchor.anchorSeq, first.anchor.anchorSeq + 1);
  assert.equal(second.anchor.prevAnchorHash, first.anchor.anchorHash);
  assert.equal(services.srIntegrity.listAnchors(scope).length, 2);
});

test("PH-10B JOB-G12-GAPSCAN reconciles expected-event rules and appends GAP_FLAGGED rows; lifecycle never deletes", async () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10b-gapscan");
  // emp-A misses the expected increment; emp-B recorded it; emp-C has a legitimate suppressor.
  ingest(services, scope, "emp-ph10b-gap-a", 1, "IDENTITY_CHANGE");
  ingest(services, scope, "emp-ph10b-gap-b", 1, "ANNUAL_INCREMENT", { orderNo: "INC/2026/07" });
  ingest(services, scope, "emp-ph10b-gap-c", 1, "INCREMENT_WITHHELD", { reason: "penalty in force" });

  const rule = services.srIntegrity.createExpectedEventRule(scope, {
    ruleCode: "ANNUAL_INCREMENT",
    expectedEventCategory: "ANNUAL_INCREMENT",
    cadence: { frequency: "ANNUAL" },
    suppressedByCategories: ["INCREMENT_WITHHELD", "SUSPENSION", "LWP_SPELL"],
    severity: "CRITICAL",
    status: "PUBLISHED",
    effectiveFrom: "2020-01-01",
    sourceRuleRef: "G10:INCREMENT-CADENCE",
  });

  const scan = services.srIntegrity.runGapScan(scope, "run-ph10b-gapscan-1", { periodFrom: "2026-01-01", periodTo: "2026-12-31" });
  assert.equal(scan.run.jobId, "JOB-G12-GAPSCAN");
  assert.equal(scan.flagged.length, 1);
  assert.equal(scan.flagged[0].employeeId, "emp-ph10b-gap-a");
  assert.equal(scan.flagged[0].gapStatus, "GAP_FLAGGED");
  assert.equal(scan.flagged[0].ruleId, rule.id);
  assert.equal(scan.flagged[0].severity, "CRITICAL");

  // Recorded and suppressed employees are not flagged.
  assert.equal(services.srIntegrity.listGaps(scope, "emp-ph10b-gap-b").length, 0);
  assert.equal(services.srIntegrity.listGaps(scope, "emp-ph10b-gap-c").length, 0);

  // Re-scanning the same window does not duplicate the open gap.
  const rescan = services.srIntegrity.runGapScan(scope, "run-ph10b-gapscan-2", { periodFrom: "2026-01-01", periodTo: "2026-12-31" });
  assert.equal(rescan.flagged.length, 0);
  assert.equal(services.srIntegrity.listGaps(scope, "emp-ph10b-gap-a").length, 1);

  // Explanations move the gap through the BRD lifecycle — the row is never deleted.
  const gapId = scan.flagged[0].id;
  const reviewed = services.srIntegrity.resolveGap(scope, gapId, { gapStatus: "UNDER_REVIEW" });
  assert.equal(reviewed.gapStatus, "UNDER_REVIEW");
  const explained = services.srIntegrity.resolveGap(scope, gapId, { gapStatus: "EXPLAINED", explanationCode: "NOT_DUE", corroboratedBy: "emp-ph10b-gap-a" });
  assert.equal(explained.gapStatus, "EXPLAINED");
  assert.equal(explained.explanationCode, "NOT_DUE");
  assert.equal(services.srIntegrity.listGaps(scope, "emp-ph10b-gap-a").length, 1);

  // Guardrails: CLOSED_RECORDED demands a real ledger entry; closed gaps cannot reopen.
  assert.throws(() => services.srIntegrity.resolveGap(scope, gapId, { gapStatus: "CLOSED_RECORDED" }), /resolvedEventId/);
  const closingEvent = ingest(services, scope, "emp-ph10b-gap-a", 2, "ANNUAL_INCREMENT", { orderNo: "INC/2026/late" });
  const closed = services.srIntegrity.resolveGap(scope, gapId, { gapStatus: "CLOSED_RECORDED", resolvedEventId: closingEvent.id });
  assert.equal(closed.gapStatus, "CLOSED_RECORDED");
  assert.equal(typeof closed.closedAt, "string");
  assert.throws(() => services.srIntegrity.resolveGap(scope, gapId, { gapStatus: "UNDER_REVIEW" }), /transition/);
});

test("PH-10B custodian attestation signs the chain head; SERVER_SIGNED is banned for statutory attestations", async () => {
  const tsa = fakeTsa();
  const services = createFoundationServices({ g12TimestampAuthority: tsa });
  const scope = actor("user-ph10b-custodian");
  ingest(services, scope, "emp-ph10b-0005", 1);
  const head = ingest(services, scope, "emp-ph10b-0005", 2);

  const attestation = services.srIntegrity.attestChainHead(scope, {
    employeeId: "emp-ph10b-0005",
    attestationKind: "CUSTODIAN_ATTEST",
    attestedRole: "SR_CUSTODIAN",
    signatureMethod: "PKI_QUALIFIED",
    certificateSerial: "CA-SERIAL-0042",
  });
  assert.equal(attestation.signedDigest, head.entryHash);
  assert.equal(attestation.subjectType, "EVENT");
  assert.equal(attestation.attestedBy, "user-ph10b-custodian");
  assert.equal(attestation.tsaTimestampToken, `fake-tsa-token:${head.entryHash}`);
  assert.equal(services.srIntegrity.listAttestations(scope, "emp-ph10b-0005").length, 1);

  // BRD G12 §5.6 r.11: server-signed statutory outputs are rejected.
  assert.throws(
    () =>
      services.srIntegrity.attestChainHead(scope, {
        employeeId: "emp-ph10b-0005",
        attestationKind: "CUSTODIAN_ATTEST",
        attestedRole: "SR_CUSTODIAN",
        signatureMethod: "SERVER_SIGNED",
      }),
    /SERVER_SIGNED/
  );
});

test("PH-10B certified extract snapshots the redacted rendering: P02 field mask fail-closed + purpose policy", async () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10b-extract");
  ingest(services, scope, "emp-ph10b-0006", 1, "IDENTITY_CHANGE", { displayName: "Kiran Verified", basicPay: 56100 });
  ingest(services, scope, "emp-ph10b-0006", 2, "PENALTY", { displayName: "Kiran Verified", penalty: "CENSURE" });
  const head = ingest(services, scope, "emp-ph10b-0006", 3, "TRANSFER", { displayName: "Kiran Verified", basicPay: 57800 });

  // Issuer holds a grant ONLY for sr.payload.displayName — every other field must be
  // redacted (fail-closed), and the loan purpose excludes disciplinary categories.
  const issuer = actor("user-ph10b-extract", { fieldGrants: ["sr.payload.displayName"] });
  const extract = services.srIntegrity.issueCertifiedExtract(issuer, scope, {
    employeeId: "emp-ph10b-0006",
    redactionPolicy: "LOAN_EXCLUDE_DISCIPLINARY",
    issuedTo: "Housing Loan Board",
    purpose: "loan",
  });

  // Purpose-driven category redaction: the PENALTY entry is excluded and recorded as redacted.
  assert.equal(extract.eventCount, 2);
  assert.equal(extract.renderedEvents.some((event) => event.eventTypeCode === "PENALTY"), false);
  assert.deepEqual(extract.redactedCategories, ["PENALTY"]);

  // P02 field mask on serialization, fail-closed: ungranted fields render as [REDACTED].
  for (const rendered of extract.renderedEvents) {
    assert.equal(rendered.payload.displayName, "Kiran Verified");
    for (const [key, value] of Object.entries(rendered.payload)) {
      if (key !== "displayName") {
        assert.equal(value, "[REDACTED]");
      }
    }
  }
  assert.equal(extract.redactedFields.includes("basicPay"), true);

  // The content digest binds the redacted rendering, and the extract carries the
  // chain-head hash it certifies.
  assert.equal(extract.contentDigest, sha256Hex(stableStringify(extract.renderedEvents)));
  assert.equal(extract.chainHeadHash, head.entryHash);
  assert.equal(extract.statusChainHeadHash.length, 64);
  assert.equal(extract.redactionPolicy, "LOAN_EXCLUDE_DISCIPLINARY");
  assert.equal(services.srIntegrity.getExtract(scope, extract.id).contentDigest, extract.contentDigest);
});

test("PH-10B integrity routes are protected and drive the pillars end-to-end", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const scope = actor("user-ph10b-routes");
  ingest(services, scope, "emp-ph10b-0007", 1);

  // JOB-G12-INTEGRITY over the API surface.
  const runResponse = await api.dispatch({
    method: "POST",
    path: "/api/v1/sr/integrity/run",
    headers: { "X-Correlation-Id": "corr-ph10b", "Idempotency-Key": "idem-ph10b-run-1" },
    body: {},
    actor: actor("user-ph10b-routes"),
  });
  assert.equal(runResponse.status, 202);
  assert.equal(runResponse.body.run.jobId, "JOB-G12-INTEGRITY");
  assert.equal(runResponse.body.result, "OK");

  // Certified extract issue over the API surface applies the same redaction path.
  const extractResponse = await api.dispatch({
    method: "POST",
    path: "/api/v1/sr/extracts",
    headers: { "X-Correlation-Id": "corr-ph10b", "Idempotency-Key": "idem-ph10b-extract-1" },
    body: { employeeId: "emp-ph10b-0007", issuedTo: "Pension Directorate", redactionPolicy: "NONE" },
    actor: actor("user-ph10b-routes", { fieldGrants: [] }),
  });
  assert.equal(extractResponse.status, 201);
  assert.equal(extractResponse.body.redactedFields.length > 0, true);

  // Without the permission the verify endpoint is denied (deny-by-default P02).
  const denied = await api.dispatch({
    method: "GET",
    path: "/api/v1/sr/employees/emp-ph10b-0007/integrity/verify",
    headers: { "X-Correlation-Id": "corr-ph10b" },
    actor: actor("user-ph10b-routes", { permissions: ["g12.sr.read"] }),
  });
  assert.equal(denied.status, 403);
});
