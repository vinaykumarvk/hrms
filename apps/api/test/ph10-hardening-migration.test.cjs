const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  Ph10MigrationDryRunService,
  createFoundationServices,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const { ph10HardeningEvidence } = require("../../../dist/apps/api/src/migration/ph10MigrationDryRun");

function scope(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    actorUserId: "user-ph10-migration",
    correlationId: "corr-ph10-migration",
    ...extra,
  };
}

test("PH-10 migration dry run certifies reconciliation without production mutation", async () => {
  const services = createFoundationServices();
  services.migrationStaging.stageEmployeeIdentity(scope(), {
    serviceNo: "GOV-100245",
    displayName: "Ananya Rao",
    sourceSystem: "legacy-hrms",
  });
  services.migrationStaging.stageEmployeeIdentity(scope(), {
    serviceNo: "GOV-100246",
    displayName: "Kiran Patel",
    sourceSystem: "legacy-hrms",
  });
  const dryRun = new Ph10MigrationDryRunService(services.migrationStaging).run(scope());
  assert.equal(dryRun.marker, "MIGRATION_DRY_RUN");
  assert.equal(dryRun.reconciliationMarker, "RECONCILIATION_CERTIFIED");
  assert.equal(dryRun.destructiveOperations, false);
  assert.equal(dryRun.productionMutationAllowed, false);
  assert.equal(dryRun.reconciliation.reconciled, true);
  assert.equal(dryRun.certifiedArtifacts.every((item) => item.owner.length > 0 && item.dueDate.length > 0), true);
  assert.equal(dryRun.readinessSummary.sourceEvidenceCaptured, true);
  assert.equal(dryRun.readinessSummary.pendingApprovalsImportedToP01, false);
  assert.equal(dryRun.readinessSummary.coexistenceRequired, true);
  assert.equal(dryRun.readinessSummary.legalAcceptanceRequiredForExceptions, true);
});

test("PH-10 hardening evidence documents required NFR, security, backup, and accessibility markers", async () => {
  const security = fs.readFileSync("docs/release/security-hardening-evidence.md", "utf8");
  const nfr = fs.readFileSync("docs/release/nfr-validation.md", "utf8");
  const backup = fs.readFileSync("ops/backup-restore-drill.md", "utf8");
  for (const marker of [
    "NFR_API_P95",
    "DASHBOARD_LCP",
    "BACKUP_RESTORE_DRILL",
    "SECURITY_SCAN_NO_SECRETS",
    "MIGRATION_DRY_RUN",
    "RECONCILIATION_CERTIFIED",
    "ACCESSIBILITY_AA",
  ]) {
    assert.equal(`${security}\n${nfr}\n${backup}`.includes(marker), true, marker);
  }
  assert.equal(ph10HardeningEvidence.apiP95Marker, "NFR_API_P95");
  assert.equal(ph10HardeningEvidence.dashboardLcpMarker, "DASHBOARD_LCP");
  assert.equal(ph10HardeningEvidence.securityMarker, "SECURITY_SCAN_NO_SECRETS");
  assert.equal(ph10HardeningEvidence.accessibilityMarker, "ACCESSIBILITY_AA");
  assert.equal(security.includes("production cutover"), true);
  assert.equal(nfr.includes("production performance certificate"), true);
  assert.equal(backup.includes("No restore into production"), true);
});
