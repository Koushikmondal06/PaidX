import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPasskeyRegistration,
  verifyPasskeyAuthentication,
} from '@/lib/auth/passkey';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, credentialId, clientDataJSON, authenticatorData, signature, publicKeyHexOrPem } = body;

    if (!userId || !credentialId || !clientDataJSON) {
      return NextResponse.json(
        { success: false, error: 'Missing required Passkey parameters' },
        { status: 400 }
      );
    }

    if (action === 'register') {
      const result = verifyPasskeyRegistration({
        userId,
        credentialId,
        clientDataJSON,
        publicKeyHexOrPem,
      });
      return NextResponse.json({ success: true, credential: result.credential });
    } else {
      const result = verifyPasskeyAuthentication({
        userId,
        credentialId,
        clientDataJSON,
        authenticatorData,
        signature,
      });
      return NextResponse.json({ success: true, result });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Passkey verification failed';
    return NextResponse.json({ success: false, error: msg }, { status: 403 });
  }
}
