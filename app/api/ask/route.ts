import { answerQuestion } from '@/lib/assistant';
import { MODEL } from '@/lib/anthropic';
import { getSession, ownerId } from '@/lib/auth';
import { estimateCostUsd } from '@/lib/cost';
import {
  createConversation,
  getConversation,
  putMessage,
  bumpConversation,
  recentHistory,
} from '@/lib/store';

// Exasol driver + ws require the Node.js runtime (not Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return json({ error: 'Sign in or start a demo to continue.' }, 401);

  let body: { question?: unknown; conversationId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return json({ error: 'Missing "question" string in body.' }, 400);

  const owner = ownerId(session);
  const email = session.anon ? null : session.sub;

  // Resolve or create the conversation up front (so we can reject 404 before streaming).
  let convId = typeof body.conversationId === 'string' ? body.conversationId : '';
  let isNew = false;
  if (convId) {
    const existing = await getConversation(owner, convId);
    if (!existing) return json({ error: 'Conversation not found.' }, 404);
  } else {
    const conv = await createConversation(owner, email, session.anon, question);
    convId = conv.convId;
    isNew = true;
  }

  await putMessage({ convId, ownerId: owner, role: 'user', question });
  const history = isNew ? [] : await recentHistory(convId);

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const t0 = Date.now();
        const result = await answerQuestion(question, history, (delta) => {
          send(controller, { type: 'text', v: delta });
        });
        const latencyMs = Date.now() - t0;
        const inTok = result.usage?.inputTokens ?? 0;
        const outTok = result.usage?.outputTokens ?? 0;
        const cacheRead = result.usage?.cacheReadTokens ?? 0;
        const cacheWrite = result.usage?.cacheWriteTokens ?? 0;
        const costUsd = estimateCostUsd(MODEL, inTok, outTok, cacheRead, cacheWrite);

        await putMessage({
          convId,
          ownerId: owner,
          role: 'assistant',
          answer: result.answer,
          suggestions: result.suggestions,
          trace: result.trace,
          evidence: result.evidence,
          chart: result.chart,
          model: MODEL,
          inputTokens: inTok,
          outputTokens: outTok,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          costUsd,
          latencyMs,
          ok: true,
        });
        await bumpConversation(owner, convId, costUsd, 2);

        send(controller, {
          type: 'done',
          conversationId: convId,
          answer: result.answer,
          suggestions: result.suggestions,
          trace: result.trace,
          evidence: result.evidence,
          chart: result.chart,
        });
      } catch (err) {
        send(controller, { type: 'error', error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
