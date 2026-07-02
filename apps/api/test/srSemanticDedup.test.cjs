// PH-03B: executes the compiled G12 SR semantic-dedup cases under `npm test`.
// Typed source of truth: apps/api/src/modules/g12/srSemanticDedup.test.ts (typechecked + compiled by the build).
const test = require("node:test");

const { srSemanticDedupCases } = require("../../../dist/apps/api/src/modules/g12/srSemanticDedup.test");

for (const testCase of srSemanticDedupCases) {
  test(`G12 SR semantic-dedup: ${testCase.name}`, () => {
    testCase.run();
  });
}
