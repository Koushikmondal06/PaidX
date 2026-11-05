import { NextResponse } from 'next/server';
import { getSessionAccountAddress } from '@/lib/server/sessionAccount';
import { CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionAccountAddress = getSessionAccountAddress();
  const defaultExpiryDays = parseInt(process.env.PERMISSION_DEFAULT_EXPIRY_DAYS || '30', 10);
  const defaultPeriodSeconds = parseInt(process.env.PERMISSION_DEFAULT_PERIOD_SECONDS || '86400', 10);

  return NextResponse.json({
    chainId: CHAIN_ID,
    sessionAccountAddress,
    tokenAddress: PAYMENT_TOKEN_ADDRESS,
    defaultExpiryDays,
    defaultPeriodSeconds,
  });
}

