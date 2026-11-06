import { NextRequest, NextResponse } from 'next/server';
import { runIndexerSync } from '@/lib/server/indexer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.INDEXER_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      const xSecret = req.headers.get('x-cron-secret');
      const bearerMatch = authHeader === `Bearer ${cronSecret}`;
      const headerMatch = xSecret === cronSecret;

      if (!bearerMatch && !headerMatch) {
        return NextResponse.json({ error: 'Unauthorized: Invalid cron secret' }, { status: 401 });
      }
    }

    const result = await runIndexerSync();
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Indexer sync failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
