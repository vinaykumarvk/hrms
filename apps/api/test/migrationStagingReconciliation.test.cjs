// PH-03C: executes the compiled read-only migration staging + reconciliation cases under `npm test`.
// The typed source of truth is apps/api/src/migration/staging/migrationStagingReconciliation.test.ts
// (typechecked + compiled by the project build). Each exported case is wrapped in a node:test test here.
const test = require("node:test");

const {
  migrationStagingReconciliationCases,
} = require("../../../dist/apps/api/src/migration/staging/migrationStagingReconciliation.test");

for (const testCase of migrationStagingReconciliationCases) {
  test(`migration staging reconciliation: ${testCase.name}`, () => {
    testCase.run();
  });
}
