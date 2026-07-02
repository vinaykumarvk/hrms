// PH-03A: executes the compiled authority-resolver PRECEDENCE cases under `npm test`.
// The typed source of truth is apps/api/src/platform/authority-resolution/authorityResolver.precedence.test.ts
// (typechecked + compiled by the project build). Each exported case is wrapped in a node:test test here.
const test = require("node:test");

const { authorityResolverPrecedenceCases } = require("../../../dist/apps/api/src/platform/authority-resolution/authorityResolver.precedence.test");

for (const testCase of authorityResolverPrecedenceCases) {
  test(`authority-resolver precedence: ${testCase.name}`, () => {
    testCase.run();
  });
}
