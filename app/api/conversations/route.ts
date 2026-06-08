import { NextResponse } from 'next/server';
import { getSession, ownerId } from '@/lib/auth';
import { listConversations } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const items = await listConversations(ownerId(s));
  return NextResponse.json({
    conversations: items.map((c) => ({
      convId: c.convId,
      title: c.title,
      updatedAt: c.updatedAt,
      msgCount: c.msgCount,
    })),
  });
}
