import { NextResponse } from 'next/server';
import { getSession, isSuperAdmin } from '@/lib/auth';
import { chatHistoryFlag } from '@/flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  return NextResponse.json({
    authed: Boolean(s),
    anon: s?.anon ?? false,
    email: s && !s.anon ? s.sub : null,
    isAdmin: s && !s.anon ? isSuperAdmin(s.sub) : false,
    chatHistory: await chatHistoryFlag(),
  });
}
