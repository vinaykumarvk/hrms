#!/usr/bin/env node
// PH-37A — contract-coverage tool.
// Computes, per module, the ratio of IMPLEMENTED kernel routes (attributed by operationId prefix)
// to the OpenAPI operations enumerated in docs/contracts/openapi/*.yaml. This turns the standing
// "implemented routes cover only a fraction of the 1,306 OpenAPI operations" caveat into a tracked,
// executable metric. Coverage is COUNT-based per module (not per-operation path matching) — see the
// report's stated limitation. `--json` prints the machine record; default prints a markdown table.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** Count OpenAPI operations in a spec file: YAML method keys nested under a path (4-space indent). */
function countOps(yaml) {
  const re = /^\s{4}(get|post|put|patch|delete):\s*$/gim;
  const matches = yaml.match(re);
  return matches ? matches.length : 0;
}

/** docs/contracts/openapi/G06.yaml -> "g06"; P01-workflow.yaml -> "p01". */
function moduleKey(fileName) {
  const base = fileName.replace(/\.ya?ml$/i, "");
  const tag = base.split("-")[0];
  return tag.toLowerCase();
}

const openapiDir = join(root, "docs/contracts/openapi");
const contractByModule = {};
let contractTotal = 0;
for (const f of readdirSync(openapiDir).filter((n) => /\.ya?ml$/i.test(n))) {
  const ops = countOps(readFileSync(join(openapiDir, f), "utf8"));
  const key = moduleKey(f);
  contractByModule[key] = (contractByModule[key] ?? 0) + ops;
  contractTotal += ops;
}

const { createFoundationApi, createFoundationServices } = require(join(root, "dist/apps/api/src"));
const routes = createFoundationApi(createFoundationServices()).listRoutes();
const implementedByModule = {};
for (const r of routes) {
  const key = (r.operationId ?? "").split(".")[0] || "?";
  implementedByModule[key] = (implementedByModule[key] ?? 0) + 1;
}
const implementedTotal = routes.length;

const modules = [...new Set([...Object.keys(contractByModule), ...Object.keys(implementedByModule)])].sort();
const rows = modules.map((m) => {
  const contract = contractByModule[m] ?? 0;
  const implemented = implementedByModule[m] ?? 0;
  const pct = contract === 0 ? null : Math.round((implemented / contract) * 1000) / 10;
  return { module: m.toUpperCase(), contract, implemented, pct };
});
const totalPct = Math.round((implementedTotal / contractTotal) * 1000) / 10;

const record = { contractTotal, implementedTotal, totalPct, rows };

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(record, null, 2) + "\n");
} else {
  const lines = [];
  lines.push("| Module | Contract ops | Implemented routes | Coverage |");
  lines.push("|---|---:|---:|---:|");
  for (const r of rows) {
    lines.push(`| ${r.module} | ${r.contract} | ${r.implemented} | ${r.pct === null ? "n/a" : r.pct + "%"} |`);
  }
  lines.push(`| **Total** | **${contractTotal}** | **${implementedTotal}** | **${totalPct}%** |`);
  process.stdout.write(lines.join("\n") + "\n");
}
