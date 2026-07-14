// Local/dev migration runner: applies apps/api/db/migrations/*.sql to the database named by
// HRMS_DATABASE_URL. Production wires runMigrations() from its bootstrap; this is a convenience
// for standing up an isolated dev/verification database (e.g. on a shared local Postgres).
const path = require("node:path");
const { Pool } = require("pg");
const { runMigrations } = require("../dist/apps/api/src/db/migrate");

const url = process.env.HRMS_DATABASE_URL;
if (!url) {
  console.error("HRMS_DATABASE_URL is required");
  process.exit(2);
}
const pool = new Pool({ connectionString: url });
const migrationsDir = path.resolve(__dirname, "..", "apps", "api", "db", "migrations");
runMigrations(pool, migrationsDir)
  .then((applied) => {
    console.log(`Applied ${applied.length} migration(s).`);
    if (applied.length) {
      console.log(applied.join("\n"));
    }
    return pool.end();
  })
  .catch((error) => {
    console.error("MIGRATION FAILED:", error.message);
    process.exit(1);
  });
