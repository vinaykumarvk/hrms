// PH-03C: executes the compiled RLS / tenant-isolation cases under `npm test`.
// The typed source of truth is apps/api/src/security/rlsTenantIsolation.test.ts
// (typechecked + compiled by the project build). Each exported case is wrapped in a node:test test here.
const test = require("node:test");

const { rlsTenantIsolationCases } = require("../../../dist/apps/api/src/security/rlsTenantIsolation.test");

for (const testCase of rlsTenantIsolationCases) {
  test(`rls tenant-isolation: ${testCase.name}`, async () => {
    testCase.run();
  });
}
