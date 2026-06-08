'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SignalPath from '@/components/SignalPath';
import ThinkingIcon from '@/components/ThinkingIcon';
import ThemeToggle from '@/components/ThemeToggle';
import AuthGate from '@/components/AuthGate';
import { AnswerSkeleton, SignalSkeleton } from '@/components/Skeletons';
import ComparisonChart from '@/components/ComparisonChart';
import DataChart from '@/components/DataChart';
import CopyButton from '@/components/CopyButton';
import Mark from '@/components/Mark';
import { EvidencePanel, RiskBadge, RiskBreakdown } from '@/components/Evidence';
import type { Row, TraceStep, Evidence, ChartSpec } from '@/lib/types';

const SUGGESTIONS = [
  'Which machines need attention today?',
  'Why is Machine M-102 high risk?',
  'Which plant has the most downtime this week?',
  'What should the operations team prioritize tomorrow?',
];

interface Me {
  authed: boolean;
  anon: boolean;
  email: string | null;
  isAdmin: boolean;
  chatHistory: boolean;
}
interface ConvMeta {
  convId: string;
  title: string;
  updatedAt: string;
  msgCount: number;
}
type ChatMessage =
  | { id: string; role: 'user'; question: string }
  | {
      id: string;
      role: 'assistant';
      answer: string;
      suggestions: string[];
      trace: TraceStep[];
      evidence: Evidence | null;
      chart: ChartSpec | null;
    };

const newId = () => crypto.randomUUID();

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [conversations, setConversations] = useState<ConvMeta[]>([]);
  const [convLoaded, setConvLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // id of the assistant message currently streaming in (drives the typing caret)
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const accRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const [health, setHealth] = useState<{ state: 'checking' | 'live' | 'down'; plants?: number; machines?: number; checkedAt?: string }>({
    state: 'checking',
  });

  const reloadMe = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me');
      setMe((await r.json()) as Me);
    } catch {
      setMe({ authed: false, anon: false, email: null, isAdmin: false, chatHistory: true });
    } finally {
      setMeLoaded(true);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/conversations');
      if (!r.ok) return;
      const d = await r.json();
      setConversations(d.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // load session on mount (setState stays inside the promise callbacks)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: Me) => {
        if (!cancelled) setMe(d);
      })
      .catch(() => {
        if (!cancelled) setMe({ authed: false, anon: false, email: null, isAdmin: false, chatHistory: true });
      })
      .finally(() => {
        if (!cancelled) setMeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const authed = me?.authed ?? false;
  const chatHistory = me?.chatHistory ?? false;
  useEffect(() => {
    if (!authed || !chatHistory) return;
    let cancelled = false;
    fetch('/api/conversations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setConversations(d.conversations ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConvLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, chatHistory]);

  // Exasol live status pill
  useEffect(() => {
    if (!me?.authed) return;
    let cancelled = false;
    const check = () =>
      fetch('/api/health')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
          setHealth(
            d.ok
              ? { state: 'live', plants: d.plants, machines: d.machines, checkedAt: at }
              : { state: 'down', checkedAt: at },
          );
        })
        .catch(() => {
          if (!cancelled) {
            const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
            setHealth({ state: 'down', checkedAt: at });
          }
        });
    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [me?.authed]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  };

  const openConversation = async (id: string) => {
    setError(null);
    setSidebarOpen(false);
    try {
      const r = await fetch(`/api/conversations/${id}`);
      if (!r.ok) return;
      const d = await r.json();
      const msgs: ChatMessage[] = (d.messages ?? []).map((m: Record<string, unknown>) =>
        m.role === 'user'
          ? { id: newId(), role: 'user', question: String(m.question ?? '') }
          : {
              id: newId(),
              role: 'assistant',
              answer: String(m.answer ?? ''),
              suggestions: (m.suggestions as string[]) ?? [],
              trace: (m.trace as TraceStep[]) ?? [],
              evidence: (m.evidence as Evidence) ?? null,
              chart: (m.chart as ChartSpec) ?? null,
            },
      );
      setMessages(msgs);
      setActiveId(id);
      setStreamingId(null);
    } catch {
      /* ignore */
    }
  };

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading || streamingId) return;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { id: newId(), role: 'user', question }]);
    setLoading(true);

    const amId = newId();
    accRef.current = '';
    let started = false;
    const stripSugg = (s: string) =>
      s.split(/\n?\s*SUGGESTIONS\s*:/i)[0].split(/\n?\s*CHART\s*:/i)[0];
    const begin = () => {
      if (started) return;
      started = true;
      setLoading(false);
      setStreamingId(amId);
      setMessages((m) => [
        ...m,
        { id: amId, role: 'assistant', answer: '', suggestions: [], trace: [], evidence: null, chart: null },
      ]);
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationId: activeId }),
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        setMe((prev) => (prev ? { ...prev, authed: false } : prev));
        return;
      }
      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const d = await res.json();
          msg = d.error || msg;
        } catch {
          /* ignore */
        }
        setError(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line) continue;
          let ev: {
            type?: string;
            v?: string;
            answer?: string;
            suggestions?: string[];
            trace?: TraceStep[];
            evidence?: Evidence | null;
            chart?: ChartSpec | null;
            conversationId?: string;
            error?: string;
          };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'text') {
            begin();
            accRef.current += ev.v ?? '';
            const ans = stripSugg(accRef.current);
            setMessages((m) =>
              m.map((x) => (x.id === amId && x.role === 'assistant' ? { ...x, answer: ans } : x)),
            );
          } else if (ev.type === 'done') {
            begin();
            setMessages((m) =>
              m.map((x) =>
                x.id === amId && x.role === 'assistant'
                  ? {
                      ...x,
                      answer: ev.answer ?? accRef.current,
                      suggestions: ev.suggestions ?? [],
                      trace: ev.trace ?? [],
                      evidence: ev.evidence ?? null,
                      chart: ev.chart ?? null,
                    }
                  : x,
              ),
            );
            if (ev.conversationId) setActiveId(ev.conversationId);
            setStreamingId(null);
            loadConversations();
          } else if (ev.type === 'error') {
            setError(ev.error || 'Something went wrong.');
          }
        }
      }
    } catch (e) {
      // user pressed Stop: keep whatever streamed in, no error
      if (!(e instanceof Error && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setStreamingId(null);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setConversations([]);
    setConvLoaded(false);
    newChat();
    setMe((prev) => (prev ? { ...prev, authed: false } : prev));
  };

  const exportPdf = async () => {
    if (messages.length === 0) return;
    const { exportConversationPdf } = await import('@/lib/exportPdf');
    const firstUser = messages.find((m) => m.role === 'user');
    const title = firstUser && firstUser.role === 'user' ? firstUser.question : 'Conversation';
    await exportConversationPdf(
      messages.map((m) => ({
        role: m.role,
        question: m.role === 'user' ? m.question : undefined,
        answer: m.role === 'assistant' ? m.answer : undefined,
        chart: m.role === 'assistant' ? m.chart : undefined,
        rows: m.role === 'assistant' ? (m.evidence?.rows ?? undefined) : undefined,
      })),
      title,
    );
  };

  if (!meLoaded) {
    return <div className="boot">Loading…</div>;
  }
  if (!me?.authed) {
    return <AuthGate onAuthed={reloadMe} />;
  }

  const showHistory = me.chatHistory && !me.anon;
  const focalOf = (ev: Evidence | null): Row | null =>
    ev?.rows?.find((r) => 'RISK_BAND' in r) ?? null;

  return (
    <div className={`chat-shell ${showHistory ? '' : 'no-side'}`}>
      {showHistory && (
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="side-top">
            <div className="brand sm">
              <Mark /> PlantPulse&nbsp;AI
            </div>
            <button className="newchat" onClick={newChat}>
              <span className="np">+</span>New chat
            </button>
          </div>
          <div className="conv-list">
            {!convLoaded && (
              <div className="conv-loading" aria-busy="true" aria-label="Loading conversations">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skel conv-skel" style={{ width: `${88 - i * 9}%` }} />
                ))}
              </div>
            )}
            {convLoaded && conversations.length === 0 && (
              <div className="conv-empty">No conversations yet</div>
            )}
            {convLoaded &&
              conversations.map((c) => (
              <button
                key={c.convId}
                className={`conv-item ${c.convId === activeId ? 'active' : ''}`}
                onClick={() => openConversation(c.convId)}
                title={c.title}
              >
                {c.title || 'Untitled'}
              </button>
            ))}
          </div>
          <div className="side-bottom">
            {me.isAdmin && (
              <Link href="/admin" className="side-link"><Mark /> Admin dashboard</Link>
            )}
            <Link href="/architecture/prototype" className="side-link">View architecture →</Link>
            <div className="side-acct">
              <span className="acct-email" title={me.email ?? ''}>{me.email}</span>
              <button className="acct-logout" onClick={logout}>Sign out</button>
            </div>
          </div>
        </aside>
      )}

      <main className="chat-main">
        <header className="chat-top">
          {showHistory && (
            <button className="hamburger" onClick={() => setSidebarOpen((s) => !s)} aria-label="Menu">≡</button>
          )}
          {!showHistory && (
            <div className="brand">
              <Mark /> PLANTPULSE&nbsp;AI
            </div>
          )}
          <div style={{ flex: 1 }} />
          <span
            className="status-pill"
            data-tip={
              health.state === 'checking'
                ? 'Checking Exasol connection…'
                : health.state === 'down'
                  ? `Exasol connection lost${health.checkedAt ? ` · last checked ${health.checkedAt}` : ''}`
                  : `Exasol connection healthy${health.checkedAt ? ` · last checked ${health.checkedAt}` : ''}`
            }
            aria-label={
              health.state === 'down'
                ? 'Exasol connection lost'
                : health.state === 'checking'
                  ? 'Checking Exasol connection'
                  : 'Exasol connection healthy'
            }
          >
            <span className={`dot ${health.state}`} />
            {health.state === 'checking'
              ? 'Checking Exasol…'
              : health.state === 'down'
                ? 'Exasol unreachable'
                : `LIVE · ${health.plants ?? 3} plants · ${health.machines ?? 18} machines`}
          </span>
          {me.anon && <span className="guest-badge">guest</span>}
          {me.anon && <button className="acct-logout" onClick={logout}>Sign in</button>}
          {messages.length > 0 && (
            <button
              className="export-btn"
              onClick={exportPdf}
              disabled={streamingId !== null}
              title="Export this conversation as a PDF"
            >
              Export PDF
            </button>
          )}
          <ThemeToggle />
        </header>

        <div className="thread" ref={threadRef}>
          {messages.length === 0 && !loading && (
            <div className="welcome">
              <h1>
                Operational Intelligence <em>at Your Fingertips</em>
              </h1>
              <p>
                Ask about any machine, plant, or production line. Every answer is computed in Exasol and
                shown step by step.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div className="turn user" key={m.id}>
                  <div className="bubble">{m.question}</div>
                </div>
              );
            }
            const focal = focalOf(m.evidence);
            const band = focal ? String(focal.RISK_BAND ?? '') : '';
            const isLast = i === messages.length - 1;
            const streaming = m.id === streamingId;
            return (
              <div className="turn assistant" key={m.id}>
                <div className="ans-head">
                  {streaming ? (
                    <ThinkingIcon />
                  ) : (
                    <span className="ico" aria-hidden="true"><span className="dmd">◆</span></span>
                  )}
                  {band && <RiskBadge band={band} />}
                  {!streaming && m.answer && (
                    <span className="head-copy">
                      <CopyButton text={m.answer} label="answer" />
                    </span>
                  )}
                </div>
                <div className="answer md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.answer}</ReactMarkdown>
                  {streaming && <span className="stream-caret" aria-hidden="true" />}
                </div>
                {focal && <RiskBreakdown row={focal} />}
                {m.evidence && m.evidence.rows.length >= 2 && <ComparisonChart rows={m.evidence.rows} />}
                {m.chart && m.evidence && m.evidence.rows.length >= 2 && m.evidence.rows[0]?.['RISK_SCORE'] == null && (
                  <DataChart spec={m.chart} rows={m.evidence.rows} />
                )}
                {(m.evidence || m.trace.length > 0) && (
                  <details className={`msg-details glassbox${isLast ? ' gb-attract' : ''}`}>
                    <summary className="gb-summary">
                      <span className="gb-ico" aria-hidden="true">◆</span>
                      <span className="gb-label">Open the glass box</span>
                      <span className="gb-hint">see the SQL, rows &amp; trace behind this answer</span>
                      <span className="gb-chev" aria-hidden="true">›</span>
                    </summary>
                    {m.evidence && (
                      <div className="panel" style={{ marginTop: 10 }}>
                        <div className="panel-head"><span className="label">Evidence · backed by Exasol</span></div>
                        <EvidencePanel evidence={m.evidence} />
                      </div>
                    )}
                    <div className="panel" style={{ marginTop: 10 }}>
                      <div className="panel-head">
                        <span className="label">Signal path · glass box</span>
                      </div>
                      <SignalPath steps={m.trace} revealed={m.trace.length} />
                    </div>
                  </details>
                )}
                {isLast && m.suggestions.length > 0 && (
                  <div className="followups">
                    <span className="label" style={{ display: 'block', marginBottom: 8 }}>Ask next</span>
                    <div className="followup-chips">
                      {m.suggestions.map((s) => (
                        <button key={s} className="chip followup" onClick={() => ask(s)} disabled={loading || streamingId !== null}>
                          {s} <span className="arrow">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="turn assistant">
              <div className="ans-head"><ThinkingIcon /></div>
              <div className="answer"><AnswerSkeleton /></div>
              <details className="msg-details glassbox gb-attract">
                <summary className="gb-summary">
                  <span className="gb-ico" aria-hidden="true">◆</span>
                  <span className="gb-label">Building the glass box…</span>
                  <span className="gb-hint">the SQL, rows &amp; trace are being assembled</span>
                  <span className="gb-chev" aria-hidden="true">›</span>
                </summary>
                <div className="panel" style={{ marginTop: 10 }}>
                  <div className="panel-head"><span className="label">Signal path · glass box</span></div>
                  <SignalSkeleton />
                </div>
              </details>
            </div>
          )}

          {error && <div className="err" style={{ margin: '12px 0' }}>⚠ {error}</div>}
        </div>

        <div className="composer">
          <form
            className="askbar"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a machine, plant, or production line…"
              aria-label="Ask a plant operations question"
            />
            {loading || streamingId ? (
              <button className="btn btn-stop" type="button" onClick={stop}>
                ◼ STOP
              </button>
            ) : (
              <button className="btn" type="submit">
                ASK
              </button>
            )}
          </form>
          <p className="composer-fine">Computed in Exasol, backed by real-time data, never guessed.</p>
        </div>
      </main>
    </div>
  );
}
