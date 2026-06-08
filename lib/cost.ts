/** Rough USD cost estimate from token usage, by model family.
 *  Prices are per 1M tokens (Anthropic list prices, approximate). */
const PRICES: { prefix: string; in: number; out: number }[] = [
  { prefix: 'claude-opus-4', in: 15, out: 75 },
  { prefix: 'claude-sonnet-4', in: 3, out: 15 },
  { prefix: 'claude-haiku-4', in: 1, out: 5 },
];

/** Prompt-caching multipliers vs. base input price (Anthropic): a 5-minute
 *  cache write costs 1.25x, a cache read costs 0.1x. */
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? { in: 3, out: 15 };
  return (
    (inputTokens / 1_000_000) * p.in +
    (outputTokens / 1_000_000) * p.out +
    (cacheReadTokens / 1_000_000) * p.in * CACHE_READ_MULT +
    (cacheWriteTokens / 1_000_000) * p.in * CACHE_WRITE_MULT
  );
}
