import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "./pool";

const CREATE_MIGRATIONS_TABLE =
  "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())";

const SELECT_APPLIED = "SELECT filename FROM schema_migrations WHERE filename = $1";
const RECORD_APPLIED = "INSERT INTO schema_migrations (filename) VALUES ($1)";

/**
 * Apply the ordered SQL migrations in `migrationsDir` idempotently.
 * Each pending migration runs inside its own transaction and is recorded in schema_migrations.
 * Returns the list of migration filenames applied in this run.
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(CREATE_MIGRATIONS_TABLE);
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const filename of files) {
    const didApply = await withTransaction(pool, async (client) => {
      const existing = await client.query(SELECT_APPLIED, [filename]);
      if ((existing.rowCount ?? 0) > 0) {
        return false;
      }
      const sql = readFileSync(join(migrationsDir, filename), "utf8");
      await client.query(sql);
      await client.query(RECORD_APPLIED, [filename]);
      return true;
    });
    if (didApply) {
      applied.push(filename);
    }
  }
  return applied;
}
