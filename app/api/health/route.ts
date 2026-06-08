import { NextResponse } from 'next/server';
import { queryRows } from '@/lib/exasol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const locked = Boolean(process.env.SITE_PASSCODE);
  try {
    const rows = await queryRows(
      `SELECT
         (SELECT COUNT(*) FROM PLANTOPS.PLANTS)   AS PLANTS,
         (SELECT COUNT(*) FROM PLANTOPS.MACHINES) AS MACHINES,
         CURRENT_TIMESTAMP AS NOW`,
    );
    const r = rows[0] ?? {};
    return NextResponse.json({
      ok: true,
      locked,
      plants: Number(r.PLANTS ?? 0),
      machines: Number(r.MACHINES ?? 0),
      now: r.NOW ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, locked, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
