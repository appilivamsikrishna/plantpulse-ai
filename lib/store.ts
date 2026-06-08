import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TBL } from './aws';
import type { Evidence, TraceStep, PriorTurn, ChartSpec } from './types';

export interface ConversationMeta {
  ownerId: string;
  convId: string;
  title: string;
  ownerEmail: string | null;
  anon: boolean;
  createdAt: string;
  updatedAt: string;
  totalCostUsd: number;
  msgCount: number;
}

export interface StoredMessage {
  convId: string;
  ts: string;
  role: 'user' | 'assistant';
  ownerId: string;
  question?: string;
  answer?: string;
  suggestions?: string[];
  trace?: TraceStep[];
  evidence?: Evidence | null;
  chart?: ChartSpec | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  ok?: boolean;
  error?: string;
}

const nowIso = () => new Date().toISOString();
/** zero-padded, sortable message sort-key */
const tsKey = () => `${String(Date.now()).padStart(15, '0')}-${crypto.randomUUID().slice(0, 8)}`;

export async function createConversation(
  ownerId: string,
  ownerEmail: string | null,
  anon: boolean,
  title: string,
): Promise<ConversationMeta> {
  const t = nowIso();
  const item: ConversationMeta & { gsiAll: string } = {
    ownerId,
    convId: `${String(Date.now()).padStart(15, '0')}-${crypto.randomUUID().slice(0, 8)}`,
    title: title.slice(0, 80),
    ownerEmail,
    anon,
    createdAt: t,
    updatedAt: t,
    totalCostUsd: 0,
    msgCount: 0,
    gsiAll: 'CONV',
  };
  await ddb.send(new PutCommand({ TableName: TBL.conversations, Item: item }));
  return item;
}

export async function getConversation(ownerId: string, convId: string): Promise<ConversationMeta | null> {
  const r = await ddb.send(new GetCommand({ TableName: TBL.conversations, Key: { ownerId, convId } }));
  return (r.Item as ConversationMeta) ?? null;
}

export async function listConversations(ownerId: string): Promise<ConversationMeta[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TBL.conversations,
      KeyConditionExpression: 'ownerId = :o',
      ExpressionAttributeValues: { ':o': ownerId },
    }),
  );
  const items = (r.Items as ConversationMeta[]) ?? [];
  return items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function deleteConversation(ownerId: string, convId: string): Promise<void> {
  const msgs = await listMessages(convId);
  await Promise.all(
    msgs.map((m) =>
      ddb.send(new DeleteCommand({ TableName: TBL.messages, Key: { convId, ts: m.ts } })),
    ),
  );
  await ddb.send(new DeleteCommand({ TableName: TBL.conversations, Key: { ownerId, convId } }));
}

export async function putMessage(msg: Omit<StoredMessage, 'ts'>): Promise<StoredMessage> {
  const item: StoredMessage = { ...msg, ts: tsKey() };
  // cap stored evidence rows to keep the item well under DynamoDB's 400KB limit
  if (item.evidence && item.evidence.rows.length > 80) {
    item.evidence = { ...item.evidence, rows: item.evidence.rows.slice(0, 80) };
  }
  await ddb.send(new PutCommand({ TableName: TBL.messages, Item: item }));
  return item;
}

export async function bumpConversation(
  ownerId: string,
  convId: string,
  addCostUsd: number,
  addMsgs: number,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TBL.conversations,
      Key: { ownerId, convId },
      UpdateExpression: 'SET updatedAt = :t, gsiAll = :g ADD totalCostUsd :c, msgCount :n',
      ExpressionAttributeValues: { ':t': nowIso(), ':g': 'CONV', ':c': addCostUsd, ':n': addMsgs },
    }),
  );
}

export async function listMessages(convId: string): Promise<StoredMessage[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TBL.messages,
      KeyConditionExpression: 'convId = :c',
      ExpressionAttributeValues: { ':c': convId },
      ScanIndexForward: true,
    }),
  );
  return (r.Items as StoredMessage[]) ?? [];
}

/** Last N turns as plain user/assistant text, for multi-turn context. */
export async function recentHistory(convId: string, maxTurns = 6): Promise<PriorTurn[]> {
  const msgs = await listMessages(convId);
  const turns: PriorTurn[] = msgs
    .map((m): PriorTurn | null => {
      if (m.role === 'user' && m.question) return { role: 'user', content: m.question };
      if (m.role === 'assistant' && m.answer) return { role: 'assistant', content: m.answer };
      return null;
    })
    .filter((t): t is PriorTurn => t !== null);
  return turns.slice(-maxTurns);
}

// ---- admin (super_admin only; access checked in the route) ----

export async function listAllConversations(limit = 200): Promise<ConversationMeta[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TBL.conversations,
      IndexName: 'all_by_updated',
      KeyConditionExpression: 'gsiAll = :g',
      ExpressionAttributeValues: { ':g': 'CONV' },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (r.Items as ConversationMeta[]) ?? [];
}
