import type { Row } from './exasol';

export type { Row };

/** A single stage in the glass-box architecture trace. */
export interface TraceStep {
  stage: 'question' | 'router' | 'exasol' | 'rows' | 'narrator' | 'guardrail' | 'cache';
  title: string;
  detail?: string;
  payload?: unknown;
}

/** The Exasol evidence backing an answer. */
export interface Evidence {
  tool: string;
  sql: string;
  rows: Row[];
  rowCount: number;
}

export interface AssistantResult {
  answer: string;
  suggestions: string[];
  trace: TraceStep[];
  evidence: Evidence | null;
  chart: ChartSpec | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

/** A grounded chart the UI draws from the evidence rows. The model picks the
 *  type and columns; the numbers always come from Exasol. */
export interface ChartSpec {
  type: 'bar' | 'line';
  x: string;
  y: string;
  label?: string;
}

/** A prior turn passed back to the assistant for multi-turn context. */
export interface PriorTurn {
  role: 'user' | 'assistant';
  content: string;
}
