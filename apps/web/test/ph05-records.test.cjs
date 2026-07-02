const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const files = [
  "apps/web/src/modules/g01/EmployeeProfile.tsx",
  "apps/web/src/modules/g12/ServiceRegisterTimeline.tsx",
  "apps/web/src/modules/g13/DocumentVaultView.tsx",
];

const recordsSource = files.map((path) => fs.readFileSync(path, "utf8")).join("\n");

test("PH-05D employee view records profile and masking evidence", () => {
  for (const marker of ["profile-360", "masked", "PII", "fieldGrants"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});

test("PH-05D Service Register view exposes append-only chain cues", () => {
  for (const marker of ["append-only", "hash", "sequence", "provenance"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});

test("PH-05D document view exposes retention and hold states", () => {
  for (const marker of ["legal hold", "retention", "fail-closed"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});
