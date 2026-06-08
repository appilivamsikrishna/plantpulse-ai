import { NextResponse } from 'next/server';
import { createSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const anonId = crypto.randomUUID();
    await createSessionCookie(anonId, true);
    return NextResponse.json({ ok: true, anon: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
