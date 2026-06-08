import Anthropic from '@anthropic-ai/sdk';

/** Claude is the thin, grounded layer: it routes a question to an Exasol view
 *  and narrates the rows. It never computes the analytics itself. */
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
