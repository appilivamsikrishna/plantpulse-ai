'use client';

import type { TraceStep } from '@/lib/types';
import CopyButton from './CopyButton';
import Sql from './Sql';

const ICON: Record<TraceStep['stage'], string> = {
  question: '?',
  router: 'AI',
  exasol: 'DB',
  rows: '≡',
  narrator: '✎',
  guardrail: '⊘',
  cache: '⚡',
};

const NLABEL: Record<TraceStep['stage'], string> = {
  question: 'Input',
  router: 'Route · Claude',
  exasol: 'Query · Exasol',
  rows: 'Result set',
  narrator: 'Narrate · Claude',
  guardrail: 'Guardrail',
  cache: 'Prompt cache',
};

const payloadText = (step: TraceStep): string | null => {
  if (step.stage === 'exasol') return step.detail ?? null;
  if (step.stage === 'rows') {
    const rows = Array.isArray(step.payload) ? step.payload : [];
    if (rows.length === 0) return 'no rows';
    const first = rows[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const preview = keys
      .slice(0, 5)
      .map((k) => `  ${k}: ${JSON.stringify(first[k])}`)
      .join('\n');
    const more = keys.length > 5 ? `\n  …+${keys.length - 5} more fields` : '';
    return `${rows.length} row(s) · first row:\n{\n${preview}${more}\n}`;
  }
  if (step.stage === 'router') {
    return step.detail && step.detail !== 'no arguments' ? `args: ${step.detail}` : 'no arguments';
  }
  if (step.stage === 'question') return step.detail ?? null;
  if (step.stage === 'guardrail') return step.detail ?? null;
  if (step.stage === 'cache') return step.detail ?? null;
  return null;
};

const SignalPath = ({ steps, revealed }: { steps: TraceStep[]; revealed: number }) => {
  if (steps.length === 0) {
    return (
      <div className="signal">
        <p className="answer ph" style={{ padding: '8px 16px 16px' }}>
          Ask a question and watch the request flow through the system. You&apos;ll see Claude route it, the
          exact SQL it runs against Exasol, and the rows that ground the answer.
        </p>
      </div>
    );
  }

  return (
    <div className="signal">
      {steps.map((step, i) => {
        const state = i < revealed - 1 ? 'done' : i === revealed - 1 ? 'on' : '';
        const kind =
          step.stage === 'exasol'
            ? 'exasol '
            : step.stage === 'router' || step.stage === 'narrator'
              ? 'model '
              : '';
        const cls = `node ${kind}${state}`;
        const body = payloadText(step);
        const showPayload =
          state !== '' &&
          body &&
          ['exasol', 'rows', 'router', 'question', 'guardrail', 'cache'].includes(step.stage);
        return (
          <div key={i}>
            {i > 0 && <div className={`connector ${i < revealed ? 'charged' : ''}`} />}
            <div className={cls}>
              <span className="ico">{ICON[step.stage]}</span>
              <div className="nlabel">{NLABEL[step.stage]}</div>
              <div className="ntitle">{step.title}</div>
              {showPayload &&
                (step.stage === 'exasol' ? (
                  <div className="sqlbox">
                    <CopyButton text={step.detail ?? ''} />
                    <Sql code={body} className="payload" />
                  </div>
                ) : (
                  <pre className="payload">{body}</pre>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SignalPath;
