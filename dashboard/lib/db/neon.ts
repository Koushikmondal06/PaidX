import 'server-only';
import { neon, Pool, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Neon Postgres Client Module for PaidX
 * 
 * Best Practices (from Neon Skills):
 * 1. For web applications and serverless route handlers, use the pooled connection (DATABASE_URL).
 * 2. Uses '@neondatabase/serverless' HTTP transport for rapid, serverless single-roundtrip queries.
 * 3. Uses WebSocket Pool for long-running sessions or multi-statement transactions.
 * 4. Fallback to DATABASE_URL_UNPOOLED if direct connection is explicitly required.
 */

const getConnectionString = (): string => {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      '[Neon DB] Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment. Run `neon deploy` or check .env.local.'
    );
  }
  return url;
};

// Singleton HTTP query client
let cachedSql: NeonQueryFunction<false, false> | null = null;

export function getNeonSql(): NeonQueryFunction<false, false> {
  if (!cachedSql) {
    const connStr = getConnectionString();
    cachedSql = neon(connStr);
  }
  return cachedSql;
}

// Singleton connection pool (WebSocket transport)
let cachedPool: Pool | null = null;

export function getNeonPool(): Pool {
  if (!cachedPool) {
    const connStr = getConnectionString();
    cachedPool = new Pool({ connectionString: connStr });
  }
  return cachedPool;
}

/**
 * Execute a parameterized SQL query on Neon Postgres via HTTP.
 */
export async function query<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const sql = getNeonSql();
  // Using neon serverless HTTP query with parameter array
  const rows = (await (sql as any).query(sqlText, params)) as unknown as T[];
  return rows;
}

/**
 * Execute a parameterized query expecting at most one row.
 */
export async function queryOne<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Neon health verification check.
 */
export async function checkNeonConnection() {
  const start = Date.now();
  const rows = await query<{
    server_time: string;
    version: string;
    database: string;
    user: string;
  }>(`SELECT NOW() as server_time, version() as version, current_database() as database, current_user as "user"`);

  const latencyMs = Date.now() - start;

  return {
    ok: true,
    latencyMs,
    serverTime: rows[0]?.server_time,
    database: rows[0]?.database,
    user: rows[0]?.user,
    version: rows[0]?.version,
    branch: process.env.NEON_BRANCH || 'production',
  };
}
