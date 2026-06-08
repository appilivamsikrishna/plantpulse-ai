'use client';

import type { Evidence, Row } from '@/lib/types';
import CopyButton from './CopyButton';
import Sql from './Sql';

export const RiskBadge = ({ band }: { band: string }) => {
  const b = (band || '').toUpperCase();
  if (!['HIGH', 'MEDIUM', 'LOW'].includes(b)) return null;
  return <span className={`badge ${b}`}>● {b} RISK</span>;
};

const COMPONENTS: { key: string; label: string; max: number }[] = [
  { key: 'VIBRATION_SCORE', label: 'Vibration', max: 40 },
  { key: 'ERROR_SCORE', label: 'Errors (24h)', max: 30 },
  { key: 'DOWNTIME_SCORE', label: 'Downtime (7d)', max: 20 },
  { key: 'MAINTENANCE_SCORE', label: 'Maintenance', max: 10 },
];

/** Risk component breakdown for a focal machine row (if the columns are present). */
export const RiskBreakdown = ({ row }: { row: Row }) => {
  const hasComponents = COMPONENTS.some((c) => row[c.key] != null);
  if (!hasComponents) return null;
  return (
    <div className="breakdown">
      {COMPONENTS.map((c) => {
        const val = Number(row[c.key] ?? 0);
        const pct = Math.max(0, Math.min(100, (val / c.max) * 100));
        return (
          <div className="bar-row" key={c.key}>
            <span className="k">{c.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="v">
              {val}/{c.max}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const fmt = (v: Row[string]): string => {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
};

export const DataTable = ({ rows, max = 12 }: { rows: Row[]; max?: number }) => {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, max);
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{fmt(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const EvidencePanel = ({ evidence }: { evidence: Evidence | null }) => {
  if (!evidence) {
    return (
      <div style={{ padding: 20 }} className="answer ph">
        The exact SQL Exasol ran and the rows it returned will appear here. Every answer is backed by this
        evidence.
      </div>
    );
  }
  return (
    <div className="evidence-body">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          SQL executed in Exasol · tool: {evidence.tool}
        </div>
        <div className="sqlbox">
          <CopyButton text={evidence.sql} />
          <Sql code={evidence.sql} className="sql" />
        </div>
      </div>
      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          {evidence.rowCount} row(s) returned
          {evidence.rows.length > 12 ? ' (showing first 12)' : ''} · scroll → for more columns
        </div>
        <DataTable rows={evidence.rows} />
      </div>
    </div>
  );
};
