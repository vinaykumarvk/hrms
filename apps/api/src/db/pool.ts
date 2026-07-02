import { Pool, PoolClient } from "pg";

/** Minimal query surface shared by Pool and PoolClient. */
export type SqlExecutor = Pick<PoolClient, "query">;

/**
 * Create a Postgres pool from an env-driven connection string.
 * No hardcoded URLs: the connection string must come from DATABASE_URL (or an explicit argument).
 */
export function createDatabasePool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return new Pool({ connectionString });
}

/** Run a unit of work inside a single BEGIN/COMMIT transaction (ROLLBACK on failure). */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
