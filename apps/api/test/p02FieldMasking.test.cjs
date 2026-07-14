// PH-03B: executes the compiled P02 field-masking cases under `npm test`.
// Typed source of truth: apps/api/src/modules/g01/p02FieldMasking.test.ts (typechecked + compiled by the build).
const test = require("node:test");

const { p02FieldMaskingCases } = require("../../../dist/apps/api/src/modules/g01/p02FieldMasking.test");

for (const testCase of p02FieldMaskingCases) {
  test(`P02 field-masking: ${testCase.name}`, async () => {
    testCase.run();
  });
}
