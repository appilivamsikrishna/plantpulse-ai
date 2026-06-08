import type Anthropic from '@anthropic-ai/sdk';
import { queryRows, type Row } from './exasol';

/**
 * The assistant's tool surface. Each curated tool is backed by exactly one
 * Exasol view, so the model picks an intent and Exasol returns the truth.
 * `run_readonly_sql` is the open-ended escape hatch — guarded to read-only
 * SELECTs against the curated PLANTOPS.V_* views only.
 */

export interface ToolRun {
  sql: string;
  rows: Row[];
  error?: string;
}

interface ToolDef {
  definition: Anthropic.Tool;
  run: (input: Record<string, unknown>) => Promise<ToolRun>;
}

// ---- guardrails for the open-ended text-to-SQL path ----
const VIEW_ALLOWLIST = [
  'V_MACHINES_NEEDING_ATTENTION',
  'V_RISK_SCORE',
  'V_MACHINE_HEALTH',
  'V_PLANT_DOWNTIME_7D',
  'V_DOWNTIME_TRENDS',
  'V_REPEATED_ERRORS',
  'V_PLANT_HEALTH',
  'V_MAINTENANCE_PRIORITY',
  'V_MACHINE_SENSORS_24H',
  'V_MACHINE_ERRORS_24H',
  'V_MACHINE_DOWNTIME_7D',
  'V_MACHINE_MAINTENANCE',
];
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|merge|truncate|grant|revoke|commit|rollback|call|execute|import|export)\b/i;
const BASE_TABLES =
  /\b(sensor_readings|error_logs|downtime_events|maintenance_records|machines|plants|production_lines)\b/i;

export function validateReadonlySql(raw: string): { ok: boolean; reason?: string } {
  const s = raw.trim();
  if (!/^select\b/i.test(s)) return { ok: false, reason: 'Only SELECT queries are allowed.' };
  if (s.includes(';')) return { ok: false, reason: 'Only a single statement is allowed.' };
  if (FORBIDDEN.test(s)) return { ok: false, reason: 'Only read-only queries are allowed.' };
  if (BASE_TABLES.test(s))
    return { ok: false, reason: 'Querying base tables is not allowed. Use the curated PLANTOPS.V_* views.' };
  const refs = [...s.matchAll(/plantops\.([a-z_0-9]+)/gi)].map((m) => m[1].toUpperCase());
  for (const r of refs) {
    if (!VIEW_ALLOWLIST.includes(r))
      return { ok: false, reason: `Object ${r} is not in the allowlist. Only curated views may be queried.` };
  }
  return { ok: true };
}

/** Wrap to enforce a hard row cap regardless of the query. */
function capped(sql: string, limit = 200): string {
  return `SELECT * FROM (${sql.trim()}) LIMIT ${limit}`;
}

async function runView(sql: string): Promise<ToolRun> {
  try {
    const rows = await queryRows(sql);
    return { sql, rows };
  } catch (err) {
    return { sql, rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

const MACHINE_ID = /^M-\d+$/i;

export const TOOLS: Record<string, ToolDef> = {
  machines_needing_attention: {
    definition: {
      name: 'machines_needing_attention',
      description:
        'List machines that need attention today (risk band HIGH or MEDIUM), ranked by risk score, with the reason breakdown and recommended action. Use for "which machines need attention", "what should we prioritize".',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: async () => runView('SELECT * FROM PLANTOPS.V_MACHINES_NEEDING_ATTENTION'),
  },

  explain_machine_risk: {
    definition: {
      name: 'explain_machine_risk',
      description:
        'Explain why a specific machine is at risk: returns its risk score, band, the decomposed component scores (vibration / errors / downtime / maintenance), and the underlying signals. Use for "why is M-102 high risk".',
      input_schema: {
        type: 'object',
        properties: {
          machine_id: { type: 'string', description: 'Machine id like M-102' },
        },
        required: ['machine_id'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const id = String(input.machine_id ?? '').toUpperCase();
      if (!MACHINE_ID.test(id))
        return { sql: '', rows: [], error: `Invalid machine id: ${input.machine_id}` };
      return runView(`SELECT * FROM PLANTOPS.V_RISK_SCORE WHERE MACHINE_ID = '${id}'`);
    },
  },

  plant_downtime_ranking: {
    definition: {
      name: 'plant_downtime_ranking',
      description:
        'Rank plants by total downtime over the last 7 days. Use for "which plant has the most downtime this week".',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: async () => runView('SELECT * FROM PLANTOPS.V_PLANT_DOWNTIME_7D'),
  },

  repeated_error_machines: {
    definition: {
      name: 'repeated_error_machines',
      description:
        'Machines logging the same error code repeatedly (>=3 times) in the last 7 days, with occurrence counts and timing. Use for "show machines with repeated vibration issues / repeated errors".',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: async () => runView('SELECT * FROM PLANTOPS.V_REPEATED_ERRORS'),
  },

  plant_health_summary: {
    definition: {
      name: 'plant_health_summary',
      description:
        'Plant-level health rollup: machine count, high/medium risk counts, average risk score, and 7-day downtime per plant. Use for "summarize Plant A operational health".',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: async () => runView('SELECT * FROM PLANTOPS.V_PLANT_HEALTH'),
  },

  maintenance_priorities: {
    definition: {
      name: 'maintenance_priorities',
      description:
        'Ranked maintenance priority list (risk plus an overdue boost). Use for "what maintenance should we prioritize".',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: async () => runView('SELECT * FROM PLANTOPS.V_MAINTENANCE_PRIORITY'),
  },

  run_readonly_sql: {
    definition: {
      name: 'run_readonly_sql',
      description:
        'Escape hatch for questions the curated tools do not cover. Provide a single read-only SELECT against the curated PLANTOPS.V_* views ONLY (e.g. V_MACHINE_HEALTH, V_DOWNTIME_TRENDS). No base tables, no writes. Prefer a curated tool when one fits.',
      input_schema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A single SELECT statement against PLANTOPS.V_* views.' },
        },
        required: ['sql'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const sql = String(input.sql ?? '');
      const check = validateReadonlySql(sql);
      if (!check.ok) return { sql, rows: [], error: `Blocked by guardrail: ${check.reason}` };
      return runView(capped(sql));
    },
  },
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.definition);

export const VIEW_CATALOG = `Curated Exasol views (schema PLANTOPS):
- V_MACHINES_NEEDING_ATTENTION(MACHINE_ID, MACHINE_NAME, MACHINE_TYPE, PLANT_NAME, LINE_NAME, RISK_SCORE, RISK_BAND, RECOMMENDED_ACTION, VIBRATION_PCT_OVER_BASELINE, ERROR_COUNT_24H, SEVERE_ERROR_COUNT_24H, ERROR_CODES_24H, DOWNTIME_MIN_7D, MAINT_OVERDUE, VIBRATION_SCORE, ERROR_SCORE, DOWNTIME_SCORE, MAINTENANCE_SCORE)
- V_RISK_SCORE(per-machine risk score 0-100, RISK_BAND, RECOMMENDED_ACTION, and all component scores + signals; one row per machine)
- V_MACHINE_HEALTH(per-machine raw signals: AVG_VIBRATION_24H, VIBRATION_BASELINE, VIBRATION_PCT_OVER_BASELINE, AVG_TEMP_24H, ERROR_COUNT_24H, DOWNTIME_MIN_7D, NEXT_DUE_DATE, MAINT_OVERDUE, plant/line)
- V_PLANT_DOWNTIME_7D(PLANT_NAME, DOWNTIME_MIN_7D, DOWNTIME_EVENTS_7D) ordered by downtime desc
- V_DOWNTIME_TRENDS(PLANT_NAME, DAY, DOWNTIME_MIN, EVENTS) daily, last 14 days
- V_REPEATED_ERRORS(MACHINE_ID, PLANT_NAME, ERROR_CODE, OCCURRENCES_7D, FIRST_SEEN, LAST_SEEN, DESCRIPTION)
- V_PLANT_HEALTH(PLANT_NAME, MACHINE_COUNT, HIGH_RISK_COUNT, MEDIUM_RISK_COUNT, AVG_RISK_SCORE, DOWNTIME_MIN_7D)
- V_MAINTENANCE_PRIORITY(MACHINE_NAME, PLANT_NAME, RISK_SCORE, NEXT_DUE_DATE, MAINT_OVERDUE, PRIORITY_SCORE)`;
