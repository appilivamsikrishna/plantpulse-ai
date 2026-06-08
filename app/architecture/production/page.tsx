import type { Metadata } from 'next';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import Mark from '@/components/Mark';
import ArchitectureHero from '@/components/ArchitectureHero';

export const metadata: Metadata = {
  title: 'Production architecture · PlantPulse AI',
  description: 'A suggested production architecture for a real plant, and the assumptions behind it.',
};

const PROD_CHANGES: { h: string; b: string }[] = [
  { h: 'On-prem LLM (data privacy)', b: 'Replace the cloud Claude API with a self-hosted open-weight model (Llama / Mistral via vLLM) inside the plant network, so operational data never leaves. The assistant layer is intentionally thin, so a smaller local model suffices, and it is swappable behind one env var.' },
  { h: 'Multi-model routing (faster, cheaper, more accurate)', b: 'Split the two LLM jobs across models: a stronger model for tool routing and SQL reasoning (small output, so the premium costs little), and a leaner, faster model for narrating rows (the large-output step). Combined with prompt caching, this gives more accurate SQL on hard questions, faster answers, and lower cost, with each model still swappable behind one env var.' },
  { h: 'Real data ingestion', b: 'Stream live sensor data from the historian / PLCs into Exasol (CDC), instead of mock data. The SQL views stay the same shape.' },
  { h: 'Pooled connections', b: 'A long-running backend holds a pooled Exasol connection instead of the serverless per-request connect.' },
  { h: 'Security & governance', b: 'SSO + role-based access, per-plant data scoping, secrets in a vault, network controls (VPC / security groups) instead of an IP allowlist.' },
  { h: 'Operationalize', b: 'Configurable, plant-specific thresholds, alerting and escalation, scheduled monitoring, and auto-scaling or multiple clusters for workload isolation.' },
];

const PROD_ASSUMPTIONS: { h: string; b: string }[] = [
  { h: 'On-prem GPU', b: 'The customer can host a GPU on-premises (or in their private cloud) to run the local LLM, sized for the chosen model.' },
  { h: 'A small model is enough', b: 'A self-hosted open-weight model (Llama or Mistral) is good enough for this thin routing and narration task, validated by evaluation. Smaller models may need a stricter router and some prompt tuning.' },
  { h: 'Exasol inside the network', b: 'Exasol runs on-premises or in the customer’s private VPC, with network access to the plant data sources.' },
  { h: 'A data pipeline exists', b: 'A real-time or near-real-time ingestion pipeline (historian, PLCs, CDC) exists or can be built to feed Exasol, and the SQL views keep the same shape.' },
  { h: 'Identity provider', b: 'An SSO provider and role definitions exist, enabling authentication and per-plant data scoping.' },
  { h: 'Ops capacity', b: 'There is capacity to run, patch, and monitor the on-prem stack: database, model server, and app.' },
  { h: 'Data must stay local', b: 'Security and data-residency policy requires data to stay inside the plant network, which is the reason for an on-prem LLM rather than a cloud API.' },
  { h: 'Calibrated thresholds', b: 'Risk thresholds and weights will be calibrated with the customer’s engineers, replacing the prototype’s illustrative defaults.' },
];

export default function ProductionArchitecturePage() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Mark /> PLANTPULSE&nbsp;AI
          <span className="sub">production architecture</span>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="toggle" href="/architecture/prototype">← prototype</Link>
        <Link className="toggle" href="/">back to app</Link>
        <ThemeToggle />
      </header>

      <main className="shell" style={{ maxWidth: 1040 }}>
        <ArchitectureHero
          label="How it would scale"
          heading={<>Suggested <em>production</em> architecture</>}
          subtitle="The same layered design, hardened for a real customer. Crucially, everything runs inside the plant network so data never leaves."
          dark="/architecture-production.svg"
          light="/architecture-production-light.svg"
          alt="Suggested production architecture (on-prem)"
        />

        <div className="panel">
          <div className="panel-head">
            <span className="label">What changes for production</span>
          </div>
          <div style={{ padding: '6px 22px 18px' }}>
            <ul className="arch-list">
              {PROD_CHANGES.map((c) => (
                <li key={c.h}>
                  <strong style={{ color: 'var(--signal)' }}>{c.h}.</strong> {c.b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="label">Assumptions for the production design</span>
          </div>
          <div style={{ padding: '6px 22px 18px' }}>
            <ul className="arch-list">
              {PROD_ASSUMPTIONS.map((a) => (
                <li key={a.h}>
                  <strong style={{ color: 'var(--signal)' }}>{a.h}.</strong> {a.b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="foot">
          <div className="foot-bottom" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            <Link href="/architecture/prototype">← Prototype architecture</Link>
            <Link href="/">back to the live assistant →</Link>
          </div>
        </footer>
      </main>
    </>
  );
}
