import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL } from './anthropic';
import { TOOLS, TOOL_DEFINITIONS, VIEW_CATALOG } from './tools';
import type { AssistantResult, Evidence, TraceStep, PriorTurn, ChartSpec } from './types';

const SYSTEM_PROMPT = `You are PlantPulse AI, a natural-language interface over a manufacturer's operations data, which lives in an Exasol analytical database.

How you work:
- All analytics (machine health, risk scoring, downtime, repeated errors) are already computed in Exasol SQL views. You do NOT calculate risk or invent numbers. You call a tool, read the rows Exasol returns, and explain them.
- Always ground every claim in tool results. Cite concrete evidence: risk score and band, % over baseline, error counts/codes, downtime minutes, dates.
- Prefer the curated tool that matches the question. Use run_readonly_sql only when no curated tool fits, and only against the curated views.
- If the data does not support an answer (no rows, or the question is outside this dataset), say so plainly. Never fabricate machines, numbers, or causes.

Answer style (for a plant manager, not an engineer):
- Lead with the direct answer. Then a short "why" backed by the numbers. Then the recommended action when relevant.
- Be concise. Use the machine/plant names and the recommended action from the data.
- Use Markdown for clarity and scannability. When the answer covers MORE THAN ONE machine, plant, or line, you MUST present the comparison as a **Markdown table**, one row per item, with columns such as Machine, Plant / Line, Risk, Key signal, Recommended action, so a manager can compare them at a glance. Never list multiple machines as separate numbered paragraphs. For a single machine, a short paragraph with **bold** key numbers plus a few bullets reads better, so don't force a table. Use headings only when they help. Write for easy reading: avoid em-dashes (the long dash); use commas, periods, or short sentences instead.
- Do NOT ask follow-up questions in your prose. Instead, end your response with a single final line:
  SUGGESTIONS: <question 1> | <question 2> | <question 3>
  with 2–3 short, natural follow-up questions the user might tap next (each under ~8 words, phrased as the user would ask). This line is turned into clickable buttons and is removed from the displayed answer.
- When the tool result is a good fit for a simple visual (a trend over time, or one number compared across a handful of items), add ONE final line just before the SUGGESTIONS line:
  CHART: <bar|line> | x=<COLUMN> | y=<COLUMN> | label=<short title>
  Use the column names exactly as they appear in the tool result rows (the SQL SELECT columns), not your formatted display labels. Use "line" for a time trend, "bar" for a comparison across items. The app draws the chart from the real rows (you never supply numbers), so only name columns that exist. Do NOT add a chart for risk-score lists (those are charted automatically), and omit the line entirely when a chart would not add value or there are fewer than two data points. This line is removed from the displayed answer.

${VIEW_CATALOG}`;

const MAX_STEPS = 4;

// Adaptive thinking is supported on Opus 4.6/4.7/4.8 and Sonnet 4.6, but NOT on
// Haiku 4.5 or older models. Detecting it here makes the model a pure env-var
// switch (ANTHROPIC_MODEL) — no code change needed to swap models.
const SUPPORTS_ADAPTIVE_THINKING = /^claude-(opus-4-[678]|sonnet-4-6)/.test(MODEL);

/** Split the model's trailing "SUGGESTIONS: a | b | c" line off the answer. */
function splitSuggestions(text: string): { answer: string; suggestions: string[] } {
  const idx = text.search(/SUGGESTIONS\s*:/i);
  if (idx === -1) return { answer: text.trim(), suggestions: [] };
  const answer = text.slice(0, idx).trim();
  const rest = text.slice(idx).replace(/SUGGESTIONS\s*:/i, '');
  const suggestions = rest
    .split('|')
    .map((s) => s.trim().replace(/^[-*•\s]+/, ''))
    .filter(Boolean)
    .slice(0, 3);
  return { answer, suggestions };
}

/** Return a shallow copy of the messages with a cache breakpoint on the last
 *  content block of the last message, so the whole conversation prefix up to
 *  that point is cached. String content is normalised to a text block (Claude
 *  treats the two identically). The original messages are left untouched. */
function withMessageCacheBreakpoint(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string'
      ? [{ type: 'text', text: last.content }]
      : last.content.map((b) => ({ ...b }));
  const tail = blocks[blocks.length - 1];
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam;
  out[out.length - 1] = { ...last, content: blocks };
  return out;
}

/** Append a glass-box step summarising how much of this turn's input was served
 *  from the prompt cache (vs. freshly processed or written). Surfaces the
 *  caching win in both the live trace and the admin transcript. */
function pushCacheStep(
  trace: TraceStep[],
  inputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): void {
  const totalInput = inputTokens + cacheReadTokens + cacheWriteTokens;
  if (totalInput === 0) return;
  const pct = Math.round((cacheReadTokens / totalInput) * 100);
  trace.push({
    stage: 'cache',
    title: `Prompt cache: ${pct}% of input read from cache`,
    detail: `${cacheReadTokens.toLocaleString()} of ${totalInput.toLocaleString()} input tokens served from cache · ${cacheWriteTokens.toLocaleString()} written, ${inputTokens.toLocaleString()} fresh`,
  });
}

/** Pull the optional "CHART: bar | x=COL | y=COL | label=..." directive off the
 *  answer text. The chart is rendered from the grounded evidence rows; this only
 *  carries the model's choice of type + columns. */
function extractChart(text: string): { text: string; chart: ChartSpec | null } {
  const m = text.match(/^[ \t]*CHART\s*:\s*(.+)$/im);
  if (!m) return { text, chart: null };
  const cleaned = text.replace(m[0], '').trim();
  const parts = m[1].split('|').map((s) => s.trim());
  const type: ChartSpec['type'] = /line/i.test(parts[0] ?? '') ? 'line' : 'bar';
  const field = (k: string) => {
    const p = parts.find((x) => x.toLowerCase().startsWith(k + '='));
    return p ? p.slice(p.indexOf('=') + 1).trim() : '';
  };
  const x = field('x');
  const y = field('y');
  const label = field('label');
  if (!x || !y) return { text: cleaned, chart: null };
  return { text: cleaned, chart: { type, x, y, label: label || undefined } };
}

export async function answerQuestion(
  question: string,
  history: PriorTurn[] = [],
  onText?: (delta: string) => void,
): Promise<AssistantResult> {
  const trace: TraceStep[] = [{ stage: 'question', title: 'Question received', detail: question }];
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.content })),
    { role: 'user', content: question },
  ];
  let evidence: Evidence | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: MODEL,
      max_tokens: 4096,
      // Prompt caching: the system prompt + tool schemas are byte-identical on
      // every call, so cache them once and read them back at ~10% cost on every
      // later step and turn. A second breakpoint on the last message caches the
      // growing conversation prefix (and the within-turn router -> narrator
      // re-read). Cache is a 5-minute prefix cache; reuse is automatic.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFINITIONS,
      messages: withMessageCacheBreakpoint(messages),
    };
    if (SUPPORTS_ADAPTIVE_THINKING) params.thinking = { type: 'adaptive' };
    let response: Anthropic.Message;
    if (onText) {
      // Stream this turn so the narration text reaches the client live.
      // (Router/tool turns emit no text, so nothing is forwarded for them.)
      const s = anthropic.messages.stream(params);
      s.on('text', (delta) => onText(delta));
      response = await s.finalMessage();
    } else {
      response = await anthropic.messages.create(params);
    }
    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;
    cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0;
    cacheWriteTokens += response.usage?.cache_creation_input_tokens ?? 0;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
      // preserve full assistant turn (incl. thinking blocks) for the next call
      messages.push({ role: 'assistant', content: response.content });

      // The model may request several tools in one turn (parallel tool use).
      // EVERY tool_use must get a matching tool_result in the next message.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        trace.push({
          stage: 'router',
          title: `Claude routed to tool: ${toolUse.name}`,
          detail: Object.keys(input).length ? JSON.stringify(input) : 'no arguments',
          payload: input,
        });

        const tool = TOOLS[toolUse.name];
        const result = tool
          ? await tool.run(input)
          : { sql: '', rows: [], error: `Unknown tool ${toolUse.name}` };

        if (result.error) {
          if (result.sql) {
            trace.push({ stage: 'exasol', title: 'Exasol query executed', detail: result.sql });
          }
          trace.push({
            stage: 'guardrail',
            title: result.sql ? 'Exasol query failed' : 'Request blocked / invalid',
            detail: result.error,
          });
        } else {
          trace.push({ stage: 'exasol', title: 'Exasol query executed', detail: result.sql });
          trace.push({
            stage: 'rows',
            title: `${result.rows.length} row(s) returned from Exasol`,
            payload: result.rows.slice(0, 25),
          });
          evidence = {
            tool: toolUse.name,
            sql: result.sql,
            rows: result.rows,
            rowCount: result.rows.length,
          };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result.error ? { error: result.error } : { rows: result.rows }),
          is_error: Boolean(result.error),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // No tool call -> final answer
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const { text: noChart, chart } = extractChart(raw);
    const { answer, suggestions } = splitSuggestions(noChart);

    trace.push({ stage: 'narrator', title: 'Answer composed from Exasol data' });
    pushCacheStep(trace, inputTokens, cacheReadTokens, cacheWriteTokens);
    return {
      answer,
      suggestions,
      trace,
      evidence,
      chart,
      usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
    };
  }

  trace.push({ stage: 'narrator', title: 'Step limit reached' });
  pushCacheStep(trace, inputTokens, cacheReadTokens, cacheWriteTokens);
  return {
    answer:
      "I wasn't able to fully resolve that within the step limit. Try rephrasing, or ask about machines needing attention, a specific machine's risk, plant downtime, or repeated errors.",
    suggestions: [],
    trace,
    evidence,
    chart: null,
    usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
  };
}
