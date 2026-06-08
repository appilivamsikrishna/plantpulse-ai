import { NextResponse } from 'next/server';
import { checkOtp } from '@/lib/otp';
import { createSessionCookie, isSuperAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { email, code } = (await request.json()) as { email?: unknown; code?: unknown };
    if (typeof email !== 'string' || typeof code !== 'string') {
      return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 });
    }
    const addr = email.trim().toLowerCase();
    const ok = await checkOtp(addr, code);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 401 });
    }
    await createSessionCookie(addr, false);
    return NextResponse.json({ ok: true, email: addr, isAdmin: isSuperAdmin(addr) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
