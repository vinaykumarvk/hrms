const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g06Source = fs.readFileSync("apps/web/src/modules/g06/PromotionWorkspace.tsx", "utf8");
const g07Source = fs.readFileSync("apps/web/src/modules/g07/TrainingWorkspace.tsx", "utf8");
const g08Source = fs.readFileSync("apps/web/src/modules/g08/AparWorkspace.tsx", "utf8");
const g09Source = fs.readFileSync("apps/web/src/modules/g09/DisciplinaryWorkspace.tsx", "utf8");

test("PH-08 client exposes statutory summary routes", () => {
  for (const marker of [
    "/api/v1/promotions/summary",
    "/api/v1/training/summary",
    "/api/v1/apar/summary",
    "/api/v1/disciplinary/summary",
  ]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-08 fixture evidence covers DPC, sealed cover, penalty, and SR markers", () => {
  for (const marker of [
    "DPC_QUORUM",
    "DPC_RECUSAL",
    "TRAINING_CERTIFICATION_POSTED",
    "APAR_FINAL_GRADE",
    "SEALED_COVER",
    "G08_G06_FEED_SUPPRESSED",
    "G09_AUTHORITY_COMPETENCE",
    "MAJOR_PENALTY",
    "APPEAL_DECIDED",
  ]) {
    assert.equal(fixtureSource.includes(marker), true, marker);
  }
});

test("PH-08 workspace renders G06, G07, G08, and G09 statutory panels", () => {
  for (const marker of ["G06", "DPC_QUORUM", "paySignalsReady"]) {
    assert.equal(g06Source.includes(marker), true, marker);
  }
  for (const marker of ["G07", "WF-G07-NOMINATION", "TRAINING_CERTIFICATION_POSTED"]) {
    assert.equal(g07Source.includes(marker), true, marker);
  }
  for (const marker of ["G08", "srEventType", "sealedMarker", "feedMarker"]) {
    assert.equal(g08Source.includes(marker), true, marker);
  }
  for (const marker of ["G09", "competenceMarker", "penaltyEventType", "appealMarker"]) {
    assert.equal(g09Source.includes(marker), true, marker);
  }
  for (const marker of ["PromotionWorkspace", "TrainingWorkspace", "AparWorkspace", "DisciplinaryWorkspace"]) {
    assert.equal(appSource.includes(marker), true, marker);
  }
});
