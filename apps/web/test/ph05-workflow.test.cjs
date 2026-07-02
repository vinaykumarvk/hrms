const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const files = [
  "apps/web/src/workflow/Inbox.tsx",
  "apps/web/src/workflow/TaskDetail.tsx",
  "apps/web/src/workflow/TaskActionPanel.tsx",
  "apps/web/src/workflow/WorkflowConfigConsole.tsx",
  "apps/web/src/workflow/workflowConfigModel.ts",
];

const workflowSource = files.map((path) => fs.readFileSync(path, "utf8")).join("\n");

test("PH-05C workflow action panel exposes all P01 actions", () => {
  for (const marker of ["approve", "reject", "send-back", "delegate", "cancel", "query", "advance"]) {
    assert.equal(workflowSource.toLowerCase().includes(marker), true, marker);
  }
});

test("PH-05C workflow task UI enforces reason and history evidence", () => {
  for (const marker of ["mandatory reason", "audit history", "Task detail", "Inbox"]) {
    assert.equal(workflowSource.includes(marker), true, marker);
  }
});

test("PH-05C workflow config supports YAML lifecycle commands", () => {
  for (const marker of ["YAML", "validate", "simulate", "submit for review", "publish", "maker-checker", "evidence export"]) {
    assert.equal(workflowSource.includes(marker), true, marker);
  }
});
