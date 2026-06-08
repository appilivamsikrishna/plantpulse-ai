import WebSocket from 'ws';
import { ExasolDriver, type ExaWebsocket } from '@exasol/exasol-driver-ts';

/**
 * Exasol connection layer.
 *
 * Design note: Vercel serverless functions are short-lived, so we open a fresh
 * connection per request (a few ms over TLS — invisible for a demo). In a
 * production deployment you'd hold a pooled, long-lived connection instead.
 */

export interface ExasolEnv {
  host: string;
  port: number;
  user: string;
  password: string;
  schema: string;
  encryption: boolean;
  tlsVerify: boolean;
}

export function getExasolEnv(): ExasolEnv {
  const host = process.env.EXASOL_HOST;
  const user = process.env.EXASOL_USER;
  const password = process.env.EXASOL_PASSWORD;
  if (!host || !user || !password) {
    throw new Error(
      'Missing Exasol credentials. Set EXASOL_HOST, EXASOL_USER, EXASOL_PASSWORD in .env.local',
    );
  }
  return {
    host,
    port: Number(process.env.EXASOL_PORT ?? 8563),
    user,
    password,
    schema: process.env.EXASOL_SCHEMA ?? 'PLANTOPS',
    encryption: process.env.EXASOL_ENCRYPTION !== 'false',
    tlsVerify: process.env.EXASOL_TLS_VERIFY !== 'false',
  };
}

export function createDriver(env: ExasolEnv = getExasolEnv()): ExasolDriver {
  const websocketFactory = (url: string) =>
    new WebSocket(url, {
      rejectUnauthorized: env.tlsVerify,
    }) as unknown as ExaWebsocket;

  // Note: we intentionally do NOT open a default schema on connect — all SQL is
  // fully qualified (PLANTOPS.*), and the seed must connect before the schema
  // exists to create it. (Opening a missing schema fails login with 08004.)
  return new ExasolDriver(websocketFactory, {
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    encryption: env.encryption,
    autocommit: true,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient errors worth retrying — mostly the Exasol SaaS cluster waking from
 *  its auto-stop idle state (connection refused / invalid / closed / timeout). */
const TRANSIENT = /invalid connection|connection|closed|timeout|econn|reset|socket|websocket|eof|refused|getaddrinfo/i;

export class ExasolWakingError extends Error {
  constructor() {
    super('The demo Exasol cluster is waking from idle. Please retry in about 30 seconds.');
    this.name = 'ExasolWakingError';
  }
}

/**
 * Open a fresh connection, run `fn`, always close. Retries on transient
 * connection errors (the cluster auto-stops after idle; the first query wakes
 * it, which can take a few seconds and throw mid-wake). Backoff: ~1.5s, 4s, 8s.
 */
export async function withExasol<T>(
  fn: (driver: ExasolDriver) => Promise<T>,
  retries = 3,
): Promise<T> {
  const delays = [1500, 4000, 8000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const driver = createDriver();
    try {
      await driver.connect();
      const out = await fn(driver);
      await driver.close().catch(() => {});
      return out;
    } catch (err) {
      lastErr = err;
      await driver.close().catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      const transient = TRANSIENT.test(msg);
      if (attempt < retries && transient) {
        await sleep(delays[attempt] ?? 8000);
        continue;
      }
      // Out of retries on a transient/connection error -> friendly waking message.
      if (transient) throw new ExasolWakingError();
      throw err;
    }
  }
  throw lastErr;
}

export type Row = Record<string, string | number | boolean | null>;

/** Run a single read query and return rows keyed by (UPPERCASE) column name. */
export async function queryRows(sql: string): Promise<Row[]> {
  return withExasol(async (driver) => {
    const result = await driver.query(sql);
    return result.getRows();
  });
}
