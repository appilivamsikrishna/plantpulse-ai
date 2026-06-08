import { NextResponse } from 'next/server';
import { getSession, isSuperAdmin } from '@/lib/auth';
import { listAllConversations } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  if (!s || s.anon || !isSuperAdmin(s.sub)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const conversations = await listAllConversations();
  const totalCost = conversations.reduce((a, c) => a + (c.totalCostUsd ?? 0), 0);
  const totalMsgs = conversations.reduce((a, c) => a + (c.msgCount ?? 0), 0);
  const users = new Set(conversations.filter((c) => !c.anon).map((c) => c.ownerEmail));
  return NextResponse.json({
    conversations,
    totals: {
      conversations: conversations.length,
      messages: totalMsgs,
      costUsd: totalCost,
      users: users.size,
      anonSessions: new Set(conversations.filter((c) => c.anon).map((c) => c.ownerId)).size,
    },
  });
}
