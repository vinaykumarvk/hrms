// Reconciles the Pg* repository SQL to the reconciled (text-column) schema: strips `::<enum>`
// casts from the repository SQL constants (the enum types were removed from the DDL). Only strips
// casts to KNOWN enum names (never ::text/::numeric/::jsonb/::int, which remain valid). `::` only
// appears in SQL template strings inside .ts, so this is safe vs TypeScript syntax.
const fs = require("node:fs");
const path = require("node:path");

const backupDir = "/tmp/migrations_uuid_backup";
const enumNames = new Set();
for (const f of fs.readdirSync(backupDir)) {
  if (!f.endsWith(".sql")) continue;
  const text = fs.readFileSync(path.join(backupDir, f), "utf8");
  for (const m of text.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM/gi)) enumNames.add(m[1]);
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
}
const files = [];
walk(path.resolve(__dirname, "..", "apps", "api", "src", "modules"), files);
let changed = 0;
for (const f of files) {
  let src = fs.readFileSync(f, "utf8");
  const before = src;
  for (const en of enumNames) {
    src = src.replace(new RegExp("::" + en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), "");
  }
  if (src !== before) { fs.writeFileSync(f, src); changed += 1; }
}
console.log(`Stripped enum casts from ${changed} repo .ts files (${enumNames.size} enum types).`);
