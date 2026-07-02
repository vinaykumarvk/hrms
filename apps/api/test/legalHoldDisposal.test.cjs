// PH-03B: executes the compiled G13 legal-hold / disposal cases under `npm test`.
// Typed source of truth: apps/api/src/modules/g13/legalHoldDisposal.test.ts (typechecked + compiled by the build).
const test = require("node:test");

const { legalHoldDisposalCases } = require("../../../dist/apps/api/src/modules/g13/legalHoldDisposal.test");

for (const testCase of legalHoldDisposalCases) {
  test(`G13 legal-hold/disposal: ${testCase.name}`, () => {
    testCase.run();
  });
}
