import type { Metadata } from 'next';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import Mark from '@/components/Mark';
import ArchitectureHero from '@/components/ArchitectureHero';

export const metadata: Metadata = {
  title: 'Prototype architecture · PlantPulse AI',
  description: 'How the PlantPulse AI prototype is built, and the assumptions behind it.',
};

const ASSUMPTIONS: { h: string; b: string }[] = [
  { h: 'Mock data', b: 'The data is synthetic but realistic, generated with deliberately planted scenarios (M-102 high risk, Pune downtime, repeated errors) rather than pulled from a real plant historian.' },
  { h: 'Time is "live"', b: 'About 3 weeks of hourly sensor readings run up to the current moment, so "today" and "this week" are always computed against the database clock.' },
  { h: 'Explainable risk score', b: 'Risk is a transparent, rule-based SQL formula (vibration, errors, downtime, and maintenance with fixed weights), chosen for explainability over a black-box ML model.' },
  { h: 'Illustrative thresholds', b: 'Risk bands are demo defaults: HIGH at 60 and above, MEDIUM at 30 and above. Error codes in the E5xx range are treated as severe.' },
  { h: 'Small, focused dataset', b: '3 plants, 6 lines, and 18 machines: enough to demonstrate the concept clearly without being production scale.' },
  { h: 'A thin assistant', b: 'The LLM only routes a question to the right Exasol view and narrates the rows it gets back. It never computes analytics, and it answers a focused set of operations questions rather than arbitrary natural language.' },
  { h: 'Read-only by design', b: 'The assistant cannot change plant state. Every generated query is SELECT-only and restricted to the curated PLANTOPS.V_* views.' },
  { h: 'No login (demo)', b: 'This open demo has no authentication. A production deployment would add SSO, role-based access, and per-plant data scoping.' },
  { h: 'Connectivity', b: 'Exasol is reached through an IP allowlist (0.0.0.0/0 for the demo) plus a token, over a per-request serverless connection with automatic retry.' },
  { h: 'Always-on cluster', b: 'For the evaluation window the single Exasol cluster has auto-stop disabled, so there is no cold-start lag. In normal use it would auto-stop when idle to save cost.' },
  { h: 'Scope', b: 'Only English-language, manufacturing-operations questions are supported. Anything out of scope is politely declined.' },
  { h: 'Static baselines', b: 'Each machine baseline is stored per machine and is not dynamically recomputed.' },
];

export default function PrototypeArchitecturePage() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Mark /> PLANTPULSE&nbsp;AI
          <span className="sub">prototype architecture</span>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="toggle" href="/architecture/production">production →</Link>
        <Link className="toggle" href="/">← back to app</Link>
        <ThemeToggle />
      </header>

      <main className="shell" style={{ maxWidth: 1040 }}>
        <ArchitectureHero
          label="How it's built"
          heading={<>Prototype <em>architecture</em></>}
          subtitle="The design running this live demo. The diagram animates the request flow step by step."
          dark="/architecture.svg"
          light="/architecture-light.svg"
          alt="Prototype architecture and request flow"
        />
        <p className="arch-p">
          One Next.js app on Vercel. The browser POSTs a question to a serverless function. <strong>Claude
          routes</strong> it to one Exasol view, the function runs that <strong>read-only SQL</strong> on
          Exasol, <strong>Claude narrates</strong> the returned rows, and the UI renders the answer with its
          SQL and evidence. <strong>All analytics live in Exasol, and the LLM only routes and narrates.</strong>
        </p>

        <div className="panel">
          <div className="panel-head">
            <span className="label">Assumptions made for this prototype</span>
          </div>
          <div style={{ padding: '6px 22px 20px' }}>
            <ul className="arch-list">
              {ASSUMPTIONS.map((a) => (
                <li key={a.h}>
                  <strong style={{ color: 'var(--signal)' }}>{a.h}.</strong> {a.b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="foot">
          <div className="foot-bottom" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            <Link href="/">← back to the live assistant</Link>
            <Link href="/architecture/production">Suggested production architecture →</Link>
          </div>
        </footer>
      </main>
    </>
  );
}
