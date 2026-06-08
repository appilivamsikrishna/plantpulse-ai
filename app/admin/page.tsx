'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import Mark from '@/components/Mark';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SignalPath from '@/components/SignalPath';
import { EvidencePanel } from '@/components/Evidence';
import ComparisonChart from '@/components/ComparisonChart';
import DataChart from '@/components/DataChart';
import type { TraceStep, Evidence, ChartSpec } from '@/lib/types';

interface Conv {
  ownerId: string;
  convId: string;
  title: string;
  ownerEmail: string | null;
  anon: boolean;
  updatedAt: string;
  totalCostUsd: number;
  msgCount: number;
}
interface Totals {
  conversations: number;
  messages: number;
  costUsd: number;
  users: number;
  anonSessions: number;
}
interface Msg {
  ts: string;
  role: string;
  question?: string;
  answer?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  trace?: TraceStep[];
  evidence?: Evidence | null;
  chart?: ChartSpec | null;
}

const usd = (n: number) => `$${(n ?? 0).toFixed(4)}`;
const when = (iso: string) => {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function AdminPage() {
  const [state, setState] = useState<'loading' | 'forbidden' | 'ready' | 'error'>('loading');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, Msg[]>>({});
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const showTip = (e: React.MouseEvent<HTMLElement>, text?: string | null) => {
    if (!text) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: Math.min(r.left, window.innerWidth - 400), y: r.bottom + 8 });
  };
  const hideTip = () => setTip(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin');
        if (r.status === 403) return setState('forbidden');
        if (!r.ok) return setState('error');
        const d = await r.json();
        setConvs(d.conversations ?? []);
        setTotals(d.totals ?? null);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, []);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!msgs[id]) {
      const r = await fetch(`/api/admin/conversation/${id}`);
      const d = await r.json();
      setMsgs((p) => ({ ...p, [id]: d.messages ?? [] }));
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Mark /> PLANTPULSE&nbsp;AI
          <span className="sub">admin</span>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="toggle" href="/">← back to app</Link>
        <ThemeToggle />
      </header>

      <main className="shell" style={{ maxWidth: 1100 }}>
        <section className="hero" style={{ paddingBottom: 6 }}>
          <h1 style={{ fontSize: 'clamp(26px,3.4vw,38px)' }}>All activity &amp; cost</h1>
        </section>

        {state === 'loading' && <div className="answer ph">Loading…</div>}
        {state === 'forbidden' && (
          <div className="err">⚠ Forbidden. Sign in with a super_admin account to view this page.</div>
        )}
        {state === 'error' && <div className="err">⚠ Could not load admin data.</div>}

        {state === 'ready' && totals && (
          <>
            <div className="admin-stats">
              <div className="stat"><div className="stat-n">{usd(totals.costUsd)}</div><div className="stat-l">total cost</div></div>
              <div className="stat"><div className="stat-n">{totals.conversations}</div><div className="stat-l">conversations</div></div>
              <div className="stat"><div className="stat-n">{totals.messages}</div><div className="stat-l">messages</div></div>
              <div className="stat"><div className="stat-n">{totals.users}</div><div className="stat-l">users</div></div>
              <div className="stat"><div className="stat-n">{totals.anonSessions}</div><div className="stat-l">guest sessions</div></div>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-head"><span className="label">Conversations</span></div>
              <div className="tablewrap">
                <table className="data data-fixed">
                  <colgroup>
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr><th>Who</th><th>Title</th><th>Msgs</th><th>Cost</th><th>Updated</th></tr>
                  </thead>
                  <tbody>
                    {convs.map((c) => (
                      <tr key={c.convId} onClick={() => toggle(c.convId)} style={{ cursor: 'pointer' }}>
                        <td
                          className="cell-clip"
                          onMouseEnter={(e) => showTip(e, c.anon ? 'Guest' : c.ownerEmail)}
                          onMouseLeave={hideTip}
                        >
                          <span className="clip-inner">
                            {c.anon ? <span className="guest-badge">guest</span> : c.ownerEmail}
                          </span>
                        </td>
                        <td className="cell-clip" onMouseEnter={(e) => showTip(e, c.title)} onMouseLeave={hideTip}>
                          <span className="clip-inner">{c.title}</span>
                        </td>
                        <td>{c.msgCount}</td>
                        <td>{usd(c.totalCostUsd)}</td>
                        <td>{when(c.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {open && (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-head"><span className="label">Conversation transcript</span></div>
                <div style={{ padding: 16 }}>
                  {(msgs[open] ?? []).map((m, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div className="label" style={{ marginBottom: 4 }}>
                        {m.role}
                        {m.role === 'assistant' && m.costUsd != null
                          ? ` · ${usd(m.costUsd)} · ${(m.inputTokens ?? 0) + (m.outputTokens ?? 0)} tok · ${m.latencyMs ?? 0}ms · ${m.model ?? ''}`
                          : ''}
                      </div>
                      {m.role === 'user' ? (
                        <div className="answer" style={{ whiteSpace: 'pre-wrap' }}>{m.question}</div>
                      ) : (
                        <>
                          <div className="answer md">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.answer ?? ''}</ReactMarkdown>
                          </div>
                          {m.evidence && m.evidence.rows.length >= 2 && <ComparisonChart rows={m.evidence.rows} />}
                          {m.chart && m.evidence && m.evidence.rows.length >= 2 && m.evidence.rows[0]?.['RISK_SCORE'] == null && (
                            <DataChart spec={m.chart} rows={m.evidence.rows} />
                          )}
                          {(m.evidence || (m.trace && m.trace.length > 0)) && (
                            <details className="msg-details">
                              <summary>Glass-box trace &amp; evidence</summary>
                              {m.evidence && (
                                <div className="panel" style={{ marginTop: 10 }}>
                                  <div className="panel-head">
                                    <span className="label">Evidence · backed by Exasol</span>
                                  </div>
                                  <EvidencePanel evidence={m.evidence} />
                                </div>
                              )}
                              {m.trace && m.trace.length > 0 && (
                                <div className="panel" style={{ marginTop: 10 }}>
                                  <div className="panel-head">
                                    <span className="label">Signal path · glass box</span>
                                  </div>
                                  <SignalPath steps={m.trace} revealed={m.trace.length} />
                                </div>
                              )}
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {(msgs[open] ?? []).length === 0 && <div className="answer ph">No messages.</div>}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {tip && (
        <div
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y,
            zIndex: 9999,
            pointerEvents: 'none',
            maxWidth: 380,
            whiteSpace: 'normal',
            fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
            fontSize: 11.5,
            fontWeight: 500,
            lineHeight: 1.45,
            color: '#eaf3ea',
            background: '#1b2430',
            border: '1px solid rgba(255,255,255,0.10)',
            padding: '7px 11px',
            borderRadius: 9,
            boxShadow: '0 10px 30px rgba(0,0,0,0.32)',
          }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}
