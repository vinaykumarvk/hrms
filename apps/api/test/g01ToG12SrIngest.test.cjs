// PH-03B: executes the compiled G01 -> G12 SR ingest integration cases under `npm test`.
// Typed source of truth: apps/api/src/modules/g01/g01ToG12SrIngest.test.ts (typechecked + compiled by the build).
const test = require("node:test");

const { g01ToG12SrIngestCases } = require("../../../dist/apps/api/src/modules/g01/g01ToG12SrIngest.test");

for (const testCase of g01ToG12SrIngestCases) {
  test(`G01->G12 SR ingest: ${testCase.name}`, async () => {
    testCase.run();
  });
}
