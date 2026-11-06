import 'server-only';
import { neon, Pool as NeonPool, type NeonQueryFunction } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

/**
 * Universal Database Client Module for PaidX
 * 
 * Supports both:
 * 1. Supabase Postgres (via 'pg' connection pooling)
 * 2. Neon Postgres (via '@neondatabase/serverless' HTTP/WebSocket transport)
 */

const getConnectionString = (): string => {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      '[Database Error] Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment.'
    );
  }
  return url;
};

// Singleton Neon HTTP query client
let cachedNeonSql: NeonQueryFunction<false, false> | null = null;
export function getNeonSql(): NeonQueryFunction<false, false> {
  if (!cachedNeonSql) {
    const connStr = getConnectionString();
    cachedNeonSql = neon(connStr);
  }
  return cachedNeonSql;
}

// Singleton pg Pool (for Supabase & standard Postgres)
let cachedPgPool: PgPool | null = null;
export function getPgPool(): PgPool {
  if (!cachedPgPool) {
    const connStr = getConnectionString();
    cachedPgPool = new PgPool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return cachedPgPool;
}

/**
 * Execute a parameterized SQL query on the active Postgres database.
 */
export async function query<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const connStr = getConnectionString();

  if (connStr.includes('neon.tech')) {
    const sql = getNeonSql();
    const rows = (await (sql as any).query(sqlText, params)) as unknown as T[];
    return rows;
  }

  // Supabase or standard PostgreSQL via pg Pool
  const pool = getPgPool();
  const { rows } = await pool.query(sqlText, params);
  return rows as T[];
}

/**
 * Execute a parameterized query expecting at most one row.
 */
export async function queryOne<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Database health verification check.
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
  const connStr = getConnectionString();
  const provider = connStr.includes('supabase')
    ? 'Supabase Postgres (Project: nuvxeixxxrtgaijmdswl)'
    : connStr.includes('neon.tech')
    ? 'Neon Lakebase Postgres'
    : 'PostgreSQL';

  return {
    ok: true,
    latencyMs,
    provider,
    serverTime: rows[0]?.server_time,
    database: rows[0]?.database,
    user: rows[0]?.user,
    version: rows[0]?.version,
    branch: process.env.NEON_BRANCH || 'production',
  };
}
