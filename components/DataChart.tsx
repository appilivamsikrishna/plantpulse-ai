'use client';

import { useEffect, useId, useState } from 'react';
import type { Row, ChartSpec } from '@/lib/types';

/** A small, dependency-free SVG chart (area-line or bar) for trends and
 *  comparisons. It is GROUNDED: every value is read from the Exasol evidence
 *  rows; the model only picks the chart type and columns. All colours/sizes are
 *  set inline (via the brand CSS variables) so it renders correctly regardless
 *  of stylesheet load order. Self-hides if columns are missing or there are
 *  fewer than two finite points. */

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const findKey = (row: Row, name: string): string | null => {
  if (row[name] != null) return name;
  const target = norm(name);
  return Object.keys(row).find((k) => norm(k) === target) ?? null;
};
const num = (v: unknown): number => {
  const m = String(v ?? '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtX = (v: string): string => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${MON[+m[2] - 1]} ${m[3]}`;
  return v.length > 14 ? v.slice(0, 13) + '…' : v;
};
const fmtN = (v: number) => Math.round(v).toLocaleString();

const GREEN = 'var(--signal)';
const AXIS = 'var(--muted)';
const GRID = 'var(--line)';
const MONO = 'var(--font-plex-mono), ui-monospace, monospace';

const DataChart = ({ spec, rows }: { spec: ChartSpec; rows: Row[] }) => {
  const uid = useId().replace(/:/g, '');
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (!rows?.length) return null;
  const keys = Object.keys(rows[0]);
  const isNumeric = (k: string) =>
    rows.filter((r) => Number.isFinite(num(r[k]))).length >= Math.ceil(rows.length * 0.6);
  // Resolve defensively: the model may name a column that isn't in the result.
  let yk = findKey(rows[0], spec.y);
  if (!yk || !isNumeric(yk)) yk = keys.find(isNumeric) ?? yk;
  let xk = findKey(rows[0], spec.x);
  if (!xk || xk === yk) xk = keys.find((k) => k !== yk) ?? xk;
  if (!xk || !yk) return null;

  const data = rows
    .map((r) => ({ x: fmtX(String(r[xk as string])), y: num(r[yk as string]) }))
    .filter((d) => Number.isFinite(d.y));
  if (data.length < 2) return null;

  const W = 640,
    H = 240,
    padL = 44,
    padR = 16,
    padT = 22,
    padB = 40;
  const cw = W - padL - padR,
    ch = H - padT - padB;
  const max = Math.max(...data.map((d) => d.y), 1);
  const n = data.length;
  const slot = cw / n;
  const xAt = (i: number) => padL + slot * i + slot / 2;
  const yAt = (v: number) => padT + ch - (v / max) * ch;
  const every = n > 9 ? Math.ceil(n / 8) : 1;

  const pts = data.map((d, i) => [xAt(i), yAt(d.y)] as const);
  const base = yAt(0);
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaPath =
    `M${pts[0][0].toFixed(1)} ${base.toFixed(1)} ` +
    pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[n - 1][0].toFixed(1)} ${base.toFixed(1)} Z`;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{spec.label || 'Chart'}</span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', color: GREEN, fontFamily: MONO }}
          role="img"
          aria-label={spec.label || 'chart'}
        >
          <defs>
            <linearGradient id={`area${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`bar${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {[0, max / 2, max].map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={yAt(v)} x2={W - padR} y2={yAt(v)} stroke={GRID} strokeWidth="1" opacity="0.6" />
              <text x={padL - 9} y={yAt(v) + 3.5} textAnchor="end" fill={AXIS} fontSize="10.5">
                {fmtN(v)}
              </text>
            </g>
          ))}

          {spec.type === 'line' ? (
            <>
              <path
                d={areaPath}
                fill={`url(#area${uid})`}
                stroke="none"
                style={{ opacity: grown ? 1 : 0, transition: 'opacity .7s ease' }}
              />
              <path
                d={linePath}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 3000,
                  strokeDashoffset: grown ? 0 : 3000,
                  transition: 'stroke-dashoffset 1s ease',
                }}
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="3.6" fill="var(--panel)" stroke="currentColor" strokeWidth="2.5" />
              ))}
            </>
          ) : (
            data.map((d, i) => {
              const bw = Math.min(slot * 0.6, 46);
              const top = yAt(d.y);
              const full = base - top;
              return (
                <g key={i}>
                  <rect
                    x={xAt(i) - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(full, 0.5)}
                    rx="4"
                    fill={`url(#bar${uid})`}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'bottom',
                      transform: grown ? 'scaleY(1)' : 'scaleY(0)',
                      transition: 'transform .6s cubic-bezier(.2,.7,.2,1)',
                    }}
                  />
                  <text
                    x={xAt(i)}
                    y={top - 7}
                    textAnchor="middle"
                    fill={AXIS}
                    fontSize="10.5"
                    style={{ opacity: grown ? 1 : 0, transition: 'opacity .5s ease .25s' }}
                  >
                    {fmtN(d.y)}
                  </text>
                </g>
              );
            })
          )}

          {data.map((d, i) =>
            i % every === 0 ? (
              <text key={i} x={xAt(i)} y={H - 14} textAnchor="middle" fill={AXIS} fontSize="10.5">
                {d.x}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
};

export default DataChart;
