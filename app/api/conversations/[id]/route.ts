import { NextResponse } from 'next/server';
import { getSession, ownerId } from '@/lib/auth';
import { getConversation, listMessages, deleteConversation } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const conv = await getConversation(ownerId(s), id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const messages = await listMessages(id);
  return NextResponse.json({ conversation: conv, messages });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id } = await params;
  const conv = await getConversation(ownerId(s), id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  await deleteConversation(ownerId(s), id);
  return NextResponse.json({ ok: true });
}
