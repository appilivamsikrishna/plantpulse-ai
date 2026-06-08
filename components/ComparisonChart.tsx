'use client';

import { useEffect, useState } from 'react';
import type { Row } from '@/lib/types';

/** Visual, animated comparison of risk across the machines in the result set,
 *  so a manager can compare them at a glance instead of reading point by point.
 *  Each bar is stacked by the four risk components (when present), so you can
 *  also see WHAT is driving each machine's risk. Self-hides unless there are
 *  at least two machines with a RISK_SCORE. */

const NAME_KEYS = ['MACHINE_NAME', 'MACHINE_ID', 'PLANT_NAME', 'LINE_NAME'];

const PARTS = [
  { key: 'VIBRATION_SCORE', label: 'Vibration', color: '#00b2ff' },
  { key: 'ERROR_SCORE', label: 'Errors', color: '#e5683b' },
  { key: 'DOWNTIME_SCORE', label: 'Downtime', color: '#f5a623' },
  { key: 'MAINTENANCE_SCORE', label: 'Maintenance', color: '#5fc33b' },
];

const SCALE = 100; // risk score range is 0..100 (40 + 30 + 20 + 10)

const bandColor = (score: number, band?: string) => {
  const b = (band || '').toUpperCase();
  if (b === 'HIGH' || score >= 60) return 'var(--high)';
  if (b === 'MEDIUM' || score >= 30) return 'var(--med)';
  return 'var(--low)';
};

const ComparisonChart = ({ rows }: { rows: Row[] }) => {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (!rows || rows.length < 2) return null;
  const nameKey = NAME_KEYS.find((k) => rows[0]?.[k] != null);
  if (!nameKey || rows[0]?.['RISK_SCORE'] == null) return null;

  const stacked = PARTS.every((p) => rows[0]?.[p.key] != null);

  const data = rows
    .filter((r) => r['RISK_SCORE'] != null)
    .map((r) => ({
      name: String(r[nameKey]),
      score: Number(r['RISK_SCORE']),
      band: r['RISK_BAND'] != null ? String(r['RISK_BAND']) : undefined,
      parts: PARTS.map((p) => ({ ...p, val: Number(r[p.key] ?? 0) })),
    }))
    .sort((a, b) => b.score - a.score);

  if (data.length < 2) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Risk comparison · highest first</span>
      </div>
      <div style={{ padding: '14px 18px 16px' }}>
        <div className="cmp">
          {data.map((d) => (
            <div className="cmp-row" key={d.name}>
              <span className="cmp-name" title={d.name}>
                {d.name}
              </span>
              <span className="cmp-track">
                {stacked ? (
                  d.parts.map((p) => (
                    <span
                      key={p.key}
                      className="cmp-seg"
                      title={`${p.label}: ${p.val}`}
                      style={{ width: grown ? `${(p.val / SCALE) * 100}%` : '0%', background: p.color }}
                    />
                  ))
                ) : (
                  <span
                    className="cmp-seg"
                    style={{
                      width: grown ? `${(d.score / SCALE) * 100}%` : '0%',
                      background: bandColor(d.score, d.band),
                    }}
                  />
                )}
              </span>
              <span className="cmp-val">{Math.round(d.score)}</span>
            </div>
          ))}
        </div>
        {stacked && (
          <div className="cmp-legend">
            {PARTS.map((p) => (
              <span key={p.key} className="cmp-leg">
                <span className="cmp-dot" style={{ background: p.color }} /> {p.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComparisonChart;
