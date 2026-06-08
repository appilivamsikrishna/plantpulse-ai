import { NextResponse } from 'next/server';
import { genCode, storeOtp, sendOtpEmail } from '@/lib/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: unknown };
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    const addr = email.trim().toLowerCase();
    const code = genCode();
    await storeOtp(addr, code);
    await sendOtpEmail(addr, code);
    return NextResponse.json({ ok: true, email: addr });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
