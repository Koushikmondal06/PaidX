import { NextResponse } from 'next/server';
import { checkNeonConnection, query } from '@/lib/db/neon';
import { getNeonDatabaseClient } from '@/lib/db/neonAdapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/neon/health
 * Proves end-to-end connectivity and operability of the wired Neon Postgres database.
 */
export async function GET() {
  try {
    // 1. Check basic connection, latency, server time, user, and version
    const connectionInfo = await checkNeonConnection();

    // 2. Query available public and auth tables
    const tables = await query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'auth') 
      ORDER BY table_schema, table_name
    `);

    // 3. Perform a live write, read, and cleanup test on Neon using the Neon client adapter
    const client = getNeonDatabaseClient();
    const testAction = 'neon_health_' + Date.now();
    
    // Write test
    const insertRes = await client.from('audit_log').insert({
      action: testAction,
      entity: 'neon_service',
      meta: { verifiedAt: new Date().toISOString(), provider: 'neon-serverless' },
    });

    if (insertRes.error) {
      throw new Error(`Write test failed on Neon: ${insertRes.error.message}`);
    }

    // Read test
    const readRes = await client.from('audit_log').select('*').eq('action', testAction).single();
    if (readRes.error || !readRes.data) {
      throw new Error(`Read verification failed on Neon: ${readRes.error?.message || 'Record not found'}`);
    }

    // Cleanup test record
    await client.from('audit_log').delete().eq('action', testAction);

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
      readWriteTest: {
        success: true,
        testedTable: 'audit_log',
        verifiedId: readRes.data.id,
      },
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
