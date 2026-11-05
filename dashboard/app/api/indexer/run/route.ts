import { NextRequest, NextResponse } from 'next/server';
import { runIndexerSync } from '@/lib/server/indexer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await runIndexerSync();
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Indexer sync failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
