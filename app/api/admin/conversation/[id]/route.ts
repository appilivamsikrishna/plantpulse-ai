import { NextResponse } from 'next/server';
import { getSession, isSuperAdmin } from '@/lib/auth';
import { listMessages } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.anon || !isSuperAdmin(s.sub)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const { id } = await params;
  const messages = await listMessages(id);
  return NextResponse.json({ messages });
}
