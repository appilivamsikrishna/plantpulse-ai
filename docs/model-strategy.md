# Design decision: single model vs. multi-model LLM routing

Status: **decided for the prototype (single model). Multi-model is a documented v2 to try post-evaluation.**
Date: 2026-06-08
Related: Jira EXA (multi-model routing ticket), `lib/assistant.ts`, `lib/cost.ts`, `/architecture/production` page.

## Context

PlantPulse AI is a thin, grounded layer over Exasol. For every question, the LLM does **two distinct jobs**, and they are already separate API calls inside the loop in `lib/assistant.ts`:

1. **Reason / route / write SQL** (the "router" step): pick the curated Exasol tool, or when none fits, generate a read-only `run_readonly_sql`. This is the thinking part.
2. **Narrate** (the final step): read the rows Exasol returned and turn them into a grounded, well-formatted, manager-facing answer.

Because they are separate calls, they can run on different models with no redesign. The question: should they?

## The key insight: route models by where the tokens are, not by where the task "feels" hard

The intuitive split is "big model writes the prose, small model does the lookup." The cost math flips that. From real logged turns:

| Step | Output tokens | Notes |
|---|---|---|
| Router / SQL | tiny (~50-150) | only emits a tool call or a SQL string |
| Narration | large (881, and 1735 on the all-machines answer) | writes the whole table + summary |

Output is the expensive side (Opus output is 5x Sonnet: $75 vs $15 per 1M). So:

- Narrating on Opus is costly: the all-machines answer is ~1,735 output tokens, ~$0.13 on Opus vs ~$0.026 on Sonnet.
- Reasoning on Opus is nearly free: ~150 output tokens is a fraction of a cent even at $75/1M.

**Cost-optimal split:** premium model on the small-output reasoning/SQL step, leaner model on the large-output narration step. You pay the premium only where the volume is small. This is the opposite of the intuitive split, and it is the headline talking point.

Narration quality still matters (grounding, no hallucinated numbers, table formatting, manager tone), so Sonnet 4.6 is the sweet spot for narration; Haiku is cheaper but riskier on formatting/grounding.

## Options considered

- **A. Single Sonnet 4.6 (current).** Fast, cheap, already high quality on the curated-tool questions, simplest caching (one cache of the system+tools prefix). The honest "right tool for the job" choice for this workload.
- **B. Single Opus 4.8.** Best raw reasoning, but 5x cost and slower responses. Cost is negligible at eval volume; the real risk is a live demo feeling sluggish on the 20-30s tool turns (streaming hides some of it).
- **C. Hybrid (Opus router/SQL + Sonnet narrator).** Best engineering story and cost profile, but adds real complexity and failure surface.

## Gotchas for the hybrid (C)

1. **Extended-thinking blocks are model-specific and signed.** If the router runs with adaptive thinking and that assistant turn (with thinking blocks) is pushed into history, a *different* narrator model can reject the signed blocks. `answerQuestion` currently pushes full `response.content` (including thinking) into `messages`, so the hybrid must strip thinking blocks at the model handoff, or keep thinking only within same-model calls.
2. **Prompt cache is per-model.** Two models = two caches of the same system+tools prefix, so the cache write is paid twice. Still a net win, just slightly less efficient than the single-model caching in place today.
3. **Operational complexity.** Two configs, two failure modes, and the glass-box trace should attribute the model per step (we already log `model` per message; extend to per step).
4. **Consistency is NOT an issue in this split**, because only one model ever writes user-facing prose; the router never produces prose.

## Decision

For the prototype / evaluation: **single model.** Do not introduce multi-model hours before the eval; the thinking-signature handling plus a second cache is new failure surface for marginal benefit at demo volume. Stay on **Sonnet 4.6** (fast, cheap, high quality for this workload). The model is a pure `ANTHROPIC_MODEL` env var, so switching to Opus is zero-code and instantly reversible if we want the flagship for the demo (test 3-4 real questions for acceptable latency first).

The strongest position is judgment, not brute force: "I'm on Sonnet because it's the right cost/latency/quality fit; the model is one env var so I can switch to Opus or split per role with no code change; here is the multi-model design and its gotchas as a documented v2."

## Implementation plan for the multi-model v2 (try post-eval, for learning)

1. Replace the single `ANTHROPIC_MODEL` with two roles: `ANTHROPIC_MODEL_REASONING` (default Opus) and `ANTHROPIC_MODEL_NARRATION` (default Sonnet), with `ANTHROPIC_MODEL` as the single-model fallback.
2. In `answerQuestion`, choose the model per step: reasoning model while `stop_reason` can be `tool_use` (router/SQL steps); narration model for the final text step.
3. Strip thinking blocks from the assistant history before the narration call (or only retain thinking within the reasoning model's own calls).
4. Keep prompt caching on both models (accept two caches). Confirm `cache_read`/`cache_creation` still reported per model.
5. Extend the glass-box trace to label the model used per step.
6. Evaluate each model on its sub-task (routing accuracy, SQL correctness, narration quality) and compare cost/latency vs. the single-Sonnet and single-Opus baselines.
