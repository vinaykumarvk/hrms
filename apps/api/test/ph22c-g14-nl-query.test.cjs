// PH-22C — G14 natural-language query (FR-15).
//   An NL question maps to a whitelisted metric with a confidence score; below threshold the query
//   is logged LOW_CONFIDENCE and NOT executed; the nl_query_log strips PII from the raw question.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const ANALYST = "user-ph22c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: ANALYST,
    actorUserId: ANALYST,
    permissions: ["*"],
    roles: ["analytics_viewer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph22c",
    ...extra,
  };
}

test("G14 nl_query: a recognised question maps to a whitelisted metric and executes", () => {
  const s = createFoundationServices();
  const res = s.nlQuery.ask(actor(), { question: "What is the current staff strength and headcount?" });
  assert.equal(res.status, "EXECUTED");
  assert.equal(res.mappedMetric, "EMPLOYEE_HEADCOUNT");
  assert.ok(res.confidence >= 0.6);
});

test("G14 nl_query: a low-confidence question is logged but NOT executed", () => {
  const s = createFoundationServices();
  const res = s.nlQuery.ask(actor(), { question: "Tell me something interesting about the weather today" });
  assert.equal(res.status, "LOW_CONFIDENCE");
  assert.ok(res.confidence < 0.6);
  // It is still logged.
  assert.ok(s.nlQuery.listLog(actor()).some((l) => l.id === res.logId && l.status === "LOW_CONFIDENCE"));
});

test("G14 nl_query_log: the logged question strips PII", () => {
  const s = createFoundationServices();
  const res = s.nlQuery.ask(actor(), { question: "headcount for employee with aadhaar 123456789012 and pan ABCDE1234F" });
  const log = s.nlQuery.listLog(actor()).find((l) => l.id === res.logId);
  assert.ok(!log.rawQuestionRedacted.includes("123456789012"));
  assert.ok(!log.rawQuestionRedacted.includes("ABCDE1234F"));
  assert.match(log.rawQuestionRedacted, /\[AADHAAR\]/);
  assert.match(log.rawQuestionRedacted, /\[PAN\]/);
});
