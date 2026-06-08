import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ChartSpec, Row } from './types';

/** Client-side PDF export of a conversation: a branded report with each
 *  question + answer, Markdown tables rendered as real tables, the grounded
 *  chart (rasterized), pagination, and a footer credit. Dynamically imported so
 *  jsPDF stays out of the main bundle. */

export interface PdfTurn {
  role: string;
  question?: string;
  answer?: string;
  chart?: ChartSpec | null;
  rows?: Row[];
}

const GREEN = '#2f9e1e';
const DARK = '#16201a';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

/** jsPDF's built-in Helvetica only encodes Latin-1. Emoji and other
 *  high-codepoint glyphs mangle into garbage ("Ø=ÜK") and corrupt the
 *  letter spacing of the whole line, so normalise punctuation to ASCII
 *  and drop anything outside Latin-1. */
const sanitize = (s: string) =>
  s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•◆∙]/g, '·') // bullets/diamond -> middle dot (Latin-1)
    .replace(/ /g, ' ')
    .replace(/[^\x00-\xFF]/g, '') // strip emoji & remaining non-Latin-1
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const stripInline = (s: string) =>
  sanitize(
    s
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1'),
  );

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => stripInline(c));

type Block = { type: 'text'; text: string } | { type: 'table'; head: string[]; rows: string[][] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) blocks.push({ type: 'text', text: t });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    const startsTable =
      line.includes('|') && next.includes('|') && /^[\s|:-]*-{2,}[\s|:-]*$/.test(next);
    if (startsTable) {
      flush();
      const head = splitRow(line);
      i += 1; // skip the |---| separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) {
        rows.push(splitRow(lines[i + 1]));
        i += 1;
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

// ---- grounded chart, rasterized for the PDF (light / print palette) ----
const C_GREEN = '#2f9e1e';
const C_AXIS = '#586259';
const C_GRID = '#d7ded8';
const CMON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cnum = (v: unknown): number => {
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const cnorm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const cfindKey = (row: Row, name: string): string | null => {
  if (row[name] != null) return name;
  const t = cnorm(name);
  return Object.keys(row).find((k) => cnorm(k) === t) ?? null;
};
const cfmtX = (v: string): string => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${CMON[+m[2] - 1]} ${m[3]}`;
  return v.length > 14 ? v.slice(0, 13) + '…' : v;
};
const cfmtN = (v: number) => Math.round(v).toLocaleString();

/** Format a date as DD-MM-YYYY HH:MM:SS AM/PM. */
function fmtStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const h12 = d.getHours() % 12 || 12;
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(h12)}:${p(d.getMinutes())}:${p(d.getSeconds())} ${ampm}`;
}
const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Build a standalone SVG string of the grounded chart, using concrete print
 *  colours (the live component uses CSS vars). Mirrors DataChart geometry. */
function buildChartSvg(spec: ChartSpec, rows: Row[]): { svg: string; w: number; h: number } | null {
  if (!rows?.length) return null;
  const keys = Object.keys(rows[0]);
  const isNum = (k: string) =>
    rows.filter((r) => Number.isFinite(cnum(r[k]))).length >= Math.ceil(rows.length * 0.6);
  let yk = cfindKey(rows[0], spec.y);
  if (!yk || !isNum(yk)) yk = keys.find(isNum) ?? yk;
  let xk = cfindKey(rows[0], spec.x);
  if (!xk || xk === yk) xk = keys.find((k) => k !== yk) ?? xk;
  if (!xk || !yk) return null;
  const data = rows
    .map((r) => ({ x: cfmtX(String(r[xk as string])), y: cnum(r[yk as string]) }))
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
  const n = data.length,
    slot = cw / n;
  const xAt = (i: number) => padL + slot * i + slot / 2;
  const yAt = (v: number) => padT + ch - (v / max) * ch;
  const base = yAt(0);
  const every = n > 9 ? Math.ceil(n / 8) : 1;

  let body = '';
  for (const v of [0, max / 2, max]) {
    body += `<line x1="${padL}" y1="${yAt(v)}" x2="${W - padR}" y2="${yAt(v)}" stroke="${C_GRID}" stroke-width="1"/>`;
    body += `<text x="${padL - 9}" y="${yAt(v) + 3.5}" text-anchor="end" fill="${C_AXIS}" font-size="10.5" font-family="monospace">${cfmtN(v)}</text>`;
  }
  if (spec.type === 'line') {
    const pts = data.map((d, i) => [xAt(i), yAt(d.y)] as const);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area =
      `M${pts[0][0].toFixed(1)} ${base.toFixed(1)} ` +
      pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
      ` L${pts[n - 1][0].toFixed(1)} ${base.toFixed(1)} Z`;
    body += `<path d="${area}" fill="url(#pdfarea)" stroke="none"/>`;
    body += `<path d="${line}" fill="none" stroke="${C_GREEN}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const p of pts)
      body += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" fill="#ffffff" stroke="${C_GREEN}" stroke-width="2.5"/>`;
  } else {
    data.forEach((d, i) => {
      const bw = Math.min(slot * 0.6, 46);
      const top = yAt(d.y);
      const full = Math.max(base - top, 0.5);
      body += `<rect x="${(xAt(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${full.toFixed(1)}" rx="4" fill="url(#pdfbar)"/>`;
      body += `<text x="${xAt(i).toFixed(1)}" y="${(top - 7).toFixed(1)}" text-anchor="middle" fill="${C_AXIS}" font-size="10.5" font-family="monospace">${cfmtN(d.y)}</text>`;
    });
  }
  data.forEach((d, i) => {
    if (i % every === 0)
      body += `<text x="${xAt(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" fill="${C_AXIS}" font-size="10.5" font-family="monospace">${xesc(d.x)}</text>`;
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>` +
    `<linearGradient id="pdfarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C_GREEN}" stop-opacity="0.30"/><stop offset="100%" stop-color="${C_GREEN}" stop-opacity="0.03"/></linearGradient>` +
    `<linearGradient id="pdfbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C_GREEN}" stop-opacity="0.95"/><stop offset="100%" stop-color="${C_GREEN}" stop-opacity="0.5"/></linearGradient>` +
    `</defs><rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
  return { svg, w: W, h: H };
}

/** Rasterize an SVG string to a PNG data URL via an offscreen canvas. */
function svgToPng(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no 2d context'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg image load failed'));
    };
    img.src = url;
  });
}

export async function exportConversationPdf(messages: PdfTurn[], title: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin - 14) {
      doc.addPage();
      y = margin;
    }
  };

  const writeText = (
    s: string,
    opts: { size?: number; color?: string; bold?: boolean; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? DARK);
    // splitTextToSize wraps on spaces only; hard-break any single token that is
    // wider than the content area (long IDs, URLs, code) so nothing bleeds past
    // the right margin.
    const hardWrap = (line: string) =>
      line
        .split(/(\s+)/)
        .map((tok) => {
          if (!tok.trim() || doc.getTextWidth(tok) <= contentW) return tok;
          let out = '';
          let cur = '';
          for (const ch of tok) {
            if (doc.getTextWidth(cur + ch) > contentW) {
              out += cur + '\n';
              cur = ch;
            } else {
              cur += ch;
            }
          }
          return out + cur;
        })
        .join('');
    const wrapped = doc.splitTextToSize(hardWrap(sanitize(s)), contentW) as string[];
    const lh = size * 1.42;
    for (const ln of wrapped) {
      ensure(lh);
      doc.text(ln, margin, y);
      y += lh;
    }
    if (opts.gap) y += opts.gap;
  };

  // header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(DARK);
  doc.text('PlantPulse AI', margin, y);
  // clickable link to the live app, right-aligned on the title baseline
  doc.setFontSize(10);
  doc.setTextColor(GREEN);
  const headerUrl = 'plant.appili.dev';
  doc.textWithLink(headerUrl, pageW - margin - doc.getTextWidth(headerUrl), y, {
    url: 'https://plant.appili.dev',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`Conversation report  ·  ${fmtStamp(new Date())}`, margin, y + 14);
  y += 28;
  doc.setDrawColor(LINE);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  for (const m of messages) {
    if (m.role === 'user') {
      ensure(34);
      writeText('You asked', { size: 8.5, color: GREEN, bold: true, gap: 3 });
      writeText(m.question ?? '', { size: 11.5, bold: true, gap: 10 });
    } else if (m.role === 'assistant') {
      ensure(24);
      writeText('PlantPulse AI', { size: 8.5, color: GREEN, bold: true, gap: 3 });
      for (const b of parseBlocks(m.answer ?? '')) {
        if (b.type === 'text') {
          const para = b.text
            .split('\n')
            .map((l) => stripInline(l).replace(/^#{1,6}\s*/, '').replace(/^[-*]\s+/, '•  '))
            .join('\n');
          writeText(para, { size: 10.5, gap: 6 });
        } else {
          ensure(48);
          autoTable(doc, {
            startY: y,
            head: [b.head],
            body: b.rows,
            margin: { left: margin, right: margin },
            tableWidth: contentW,
            styles: { fontSize: 8.5, cellPadding: 4, textColor: '#243029', lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak' },
            headStyles: { fillColor: '#eef3ee', textColor: DARK, fontStyle: 'bold' },
            theme: 'grid',
          });
          const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
          y = (last?.finalY ?? y) + 12;
        }
      }
      // grounded chart (same as the chat), rasterized; skip risk lists
      if (m.chart && m.rows && m.rows.length >= 2 && m.rows[0]?.['RISK_SCORE'] == null) {
        const chart = buildChartSvg(m.chart, m.rows);
        if (chart) {
          try {
            const png = await svgToPng(chart.svg, chart.w, chart.h);
            const imgW = contentW;
            const imgH = imgW * (chart.h / chart.w);
            ensure(imgH + 12);
            if (m.chart.label) writeText(m.chart.label, { size: 8.5, color: GREEN, bold: true, gap: 4 });
            doc.addImage(png, 'PNG', margin, y, imgW, imgH);
            y += imgH + 12;
          } catch {
            /* if rasterization fails, the table above still carries the data */
          }
        }
      }
      y += 10;
    }
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    const credit = 'PlantPulse AI · powered by Exasol · Built by Appili Vamsi Krishna · ';
    doc.text(credit, margin, pageH - 22);
    doc.setTextColor(GREEN);
    doc.textWithLink('plant.appili.dev', margin + doc.getTextWidth(credit), pageH - 22, {
      url: 'https://plant.appili.dev',
    });
    doc.setTextColor(MUTED);
    doc.text(`${p} / ${pages}`, pageW - margin, pageH - 22, { align: 'right' });
  }

  const slug =
    (title || 'conversation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'conversation';
  doc.save(`plantpulse-${slug}.pdf`);
}
