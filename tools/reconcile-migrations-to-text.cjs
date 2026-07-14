// Reconciliation transform v2 (user direction: "make the database use text IDs").
// Converts UUID/enum DDL -> text-id/plain-string DDL matching the runtime + Pg* repos:
//   - drop `CREATE TYPE <name> AS ENUM (...)` declarations
//   - enum-typed columns -> text  (TYPE position only: the 2nd token on a column-def line,
//     so a column NAMED after an enum is never mangled), plus `ALTER ... TYPE <enum>` and `::<enum>`
//   - `uuid` column type -> text, `uuid[]` -> text[], `::uuid` -> ::text
//   - strip `DEFAULT gen_random_uuid()` (the app generates ids)
const fs = require("node:fs");
const path = require("node:path");

const migDir = path.resolve(__dirname, "..", "apps", "api", "db", "migrations");
const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

const enumNames = new Set();
for (const f of files) {
  const text = fs.readFileSync(path.join(migDir, f), "utf8");
  for (const m of text.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM/gi)) enumNames.add(m[1]);
}

let changedFiles = 0;
for (const f of files) {
  const p = path.join(migDir, f);
  let src = fs.readFileSync(p, "utf8");
  const before = src;
  // 1. drop CREATE TYPE ... AS ENUM ( ... );
  src = src.replace(/CREATE TYPE\s+\w+\s+AS ENUM\s*\([^;]*?\);/gi, "");
  // 1b. drop `ALTER TYPE <enum> ADD VALUE ...` (enum extensions; invalid once the enum types are gone)
  src = src.replace(/ALTER TYPE\s+\w+\s+ADD VALUE[^;]*;/gi, "");
  // 2. keep an id default but make it text-compatible (seed INSERTs in migrations omit id and
  //    relied on the uuid default). gen_random_uuid()::text gives those rows a uuid-shaped text id;
  //    app INSERTs supply their own text id and override it.
  src = src.replace(/(DEFAULT\s+)gen_random_uuid\s*\(\s*\)/gi, "$1gen_random_uuid()::text");
  // 3. uuid[] -> text[], ::uuid -> ::text
  src = src.replace(/uuid\[\]/g, "text[]");
  src = src.replace(/::uuid\b/g, "::text");
  // 4. uuid column type -> text (space-delimited token forms; leave 'uuid-ossp'/comments alone)
  src = src.replace(/(\s)uuid(\s)/g, "$1text$2");
  src = src.replace(/(\s)uuid,/g, "$1text,");
  src = src.replace(/(\s)uuid\)/g, "$1text)");
  // 5. enum-typed columns -> text, in every type position (never the column NAME):
  //    a) CREATE TABLE col def: <indent> <colname> <type>
  //    b) ADD/ALTER COLUMN <colname> <type>
  //    c) ALTER COLUMN <colname> TYPE <type>
  //    d) ::<type> casts
  const out = src.split("\n").map((line) => {
    // a) CREATE TABLE column definition
    let m = line.match(/^(\s+`?\w+`?\s+)(\w+)(\b.*)$/);
    if (m && enumNames.has(m[2])) line = m[1] + "text" + m[3];
    // b) ADD COLUMN / ALTER COLUMN <col> <enum>
    line = line.replace(/((?:ADD|ALTER)\s+COLUMN\s+`?\w+`?\s+)(\w+)(\b)/, (mm, pre, typ, post) => (enumNames.has(typ) ? pre + "text" + post : mm));
    // c) TYPE <enum>
    line = line.replace(/(\bTYPE\s+)(\w+)(\b)/, (mm, pre, typ, post) => (enumNames.has(typ) ? pre + "text" + post : mm));
    // d) ::<enum> casts
    line = line.replace(/::(\w+)\b/g, (mm, typ) => (enumNames.has(typ) ? "::text" : mm));
    return line;
  }).join("\n");
  if (out !== before) {
    fs.writeFileSync(p, out);
    changedFiles += 1;
  }
}
console.log(`Transformed ${changedFiles}/${files.length} migration files; enum types: ${enumNames.size}.`);
