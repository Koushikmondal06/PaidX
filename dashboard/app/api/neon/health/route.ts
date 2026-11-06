import { NextRequest, NextResponse } from 'next/server';
import { checkNeonConnection, query } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';

/**
 * GET /api/neon/health
 * Proves connectivity to Neon Postgres database (read-only, gated behind secret).
 */
export async function GET(req: NextRequest) {
  try {
    const healthSecret = process.env.HEALTH_SECRET || process.env.CRON_SECRET;
    if (healthSecret) {
      const authHeader = req.headers.get('authorization');
      const xSecret = req.headers.get('x-health-secret');
      if (authHeader !== `Bearer ${healthSecret}` && xSecret !== healthSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Check basic connection, latency, server time, user, and version
    const connectionInfo = await checkNeonConnection();

    // Query available public and auth tables
    const tables = await query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'auth') 
      ORDER BY table_schema, table_name
    `);

    return NextResponse.json({
      status: 'healthy',
      provider: connectionInfo.provider || 'PostgreSQL',
      branch: connectionInfo.branch,
      serverTime: connectionInfo.serverTime,
      latencyMs: connectionInfo.latencyMs,
      database: connectionInfo.database,
      user: connectionInfo.user,
      version: connectionInfo.version,
      tableCount: tables.length,
      tables: tables.map((t) => `${t.table_schema}.${t.table_name}`),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
