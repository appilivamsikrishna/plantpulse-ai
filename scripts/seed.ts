/**
 * Seeds the Exasol database end-to-end:
 *   1. applies db/schema.sql
 *   2. generates mock plant data with deliberately planted stories
 *   3. bulk-inserts it
 *   4. applies db/views.sql
 *   5. prints a summary so you can eyeball the demo signals
 *
 * Run once after setting Exasol creds in .env.local:  npm run seed
 *
 * Planted stories (so the assistant produces non-trivial answers):
 *   - M-102 (Press, Hyderabad): vibration ramping to ~+35% above baseline over
 *     the last 5 days + 4 severe E5xx errors in 24h  ->  risk HIGH, the star.
 *   - Pune Plant (P-B): a bad downtime week (~540 downtime minutes in 7 days)
 *     ->  top plant for "which plant has the most downtime this week?".
 *   - M-107 / M-115: the same error code repeated through the week
 *     ->  "show machines with repeated issues".
 *   - M-110: maintenance overdue + mild vibration  ->  maintenance-driven risk.
 */
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExasolDriver } from '@exasol/exasol-driver-ts';
import { createDriver } from '../lib/exasol';

loadEnv({ path: '.env.local' });

const HOUR = 3_600_000;
const DAY = 86_400_000;

// ---------- deterministic PRNG (reproducible data) ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Data is deterministic per seed. Pass a different seed to regenerate a fresh
// variation in one command:  npm run seed -- --seed 99   (default 42).
// The planted demo stories (M-102 high risk, Pune downtime, etc.) hold for any
// seed — only the surrounding noise changes.
function parseSeed(): number {
  const args = process.argv.slice(2);
  const i = args.indexOf('--seed');
  if (i >= 0 && args[i + 1] && Number.isFinite(Number(args[i + 1]))) return Number(args[i + 1]);
  const eq = args.find((a) => a.startsWith('--seed='));
  if (eq && Number.isFinite(Number(eq.split('=')[1]))) return Number(eq.split('=')[1]);
  return 42;
}
const SEED = parseSeed();
const rand = mulberry32(SEED);
const noise = (pct: number) => 1 + (rand() * 2 - 1) * pct; // multiplicative ±pct

// ---------- timestamp helpers (operate in the DB clock's naive space) ----------
const pad = (n: number) => String(n).padStart(2, '0');
function parseDbTs(s: string): number {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Cannot parse DB timestamp: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function tsLit(ms: number): string {
  const d = new Date(ms);
  return `TIMESTAMP '${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}'`;
}
function dateLit(ms: number): string {
  const d = new Date(ms);
  return `DATE '${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}'`;
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ---------- reference data ----------
const PLANTS = [
  { id: 'P-A', name: 'Hyderabad Plant', location: 'Hyderabad, IN', region: 'South' },
  { id: 'P-B', name: 'Pune Plant', location: 'Pune, IN', region: 'West' },
  { id: 'P-C', name: 'Chennai Plant', location: 'Chennai, IN', region: 'South' },
];
const LINES = [
  { id: 'L-A1', plant: 'P-A', name: 'Assembly A1' },
  { id: 'L-A2', plant: 'P-A', name: 'Assembly A2' },
  { id: 'L-B1', plant: 'P-B', name: 'Packaging B1' },
  { id: 'L-B2', plant: 'P-B', name: 'Machining B2' },
  { id: 'L-C1', plant: 'P-C', name: 'Welding C1' },
  { id: 'L-C2', plant: 'P-C', name: 'Finishing C2' },
];
const TYPE = {
  CNC: { vib: 2.5, temp: 55, rpm: 1800, model: 'Haas VF-2' },
  PRESS: { vib: 3.0, temp: 60, rpm: 600, model: 'Schuler MSP-400' },
  CONVEYOR: { vib: 1.8, temp: 45, rpm: 300, model: 'Dorner 2200' },
  ROBOT: { vib: 2.0, temp: 50, rpm: 0, model: 'KUKA KR-16' },
  PUMP: { vib: 2.8, temp: 58, rpm: 1450, model: 'Grundfos CR-15' },
  COMPRESSOR: { vib: 3.5, temp: 65, rpm: 2950, model: 'Atlas GA-30' },
} as const;
type MType = keyof typeof TYPE;

const MACHINES: { id: string; line: string; type: MType }[] = [
  { id: 'M-101', line: 'L-A1', type: 'CNC' },
  { id: 'M-102', line: 'L-A1', type: 'PRESS' }, // STAR: high risk
  { id: 'M-103', line: 'L-A1', type: 'CONVEYOR' },
  { id: 'M-104', line: 'L-A2', type: 'ROBOT' },
  { id: 'M-105', line: 'L-A2', type: 'PUMP' },
  { id: 'M-106', line: 'L-A2', type: 'COMPRESSOR' },
  { id: 'M-107', line: 'L-B1', type: 'PRESS' }, // repeated E521 + downtime
  { id: 'M-108', line: 'L-B1', type: 'CNC' }, // downtime
  { id: 'M-109', line: 'L-B1', type: 'CONVEYOR' },
  { id: 'M-110', line: 'L-B2', type: 'PUMP' }, // overdue maintenance + downtime
  { id: 'M-111', line: 'L-B2', type: 'ROBOT' }, // downtime
  { id: 'M-112', line: 'L-B2', type: 'COMPRESSOR' },
  { id: 'M-113', line: 'L-C1', type: 'CNC' },
  { id: 'M-114', line: 'L-C1', type: 'PRESS' },
  { id: 'M-115', line: 'L-C1', type: 'CONVEYOR' }, // repeated E210
  { id: 'M-116', line: 'L-C2', type: 'ROBOT' },
  { id: 'M-117', line: 'L-C2', type: 'PUMP' }, // small downtime
  { id: 'M-118', line: 'L-C2', type: 'COMPRESSOR' },
];

// ---------- SQL file splitter (comment- and string-literal aware) ----------
function splitSql(content: string): string[] {
  const stmts: string[] = [];
  let cur = '';
  let inLine = false; // -- line comment
  let inBlock = false; // /* block comment */
  let inStr = false; // '...' string literal
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    if (inLine) {
      cur += c;
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      cur += c;
      if (c === '*' && next === '/') {
        cur += next;
        i++;
        inBlock = false;
      }
      continue;
    }
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (next === "'") {
          cur += next;
          i++;
        } else {
          inStr = false;
        }
      }
      continue;
    }
    if (c === '-' && next === '-') {
      inLine = true;
      cur += c;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      cur += c;
      continue;
    }
    if (c === "'") {
      inStr = true;
      cur += c;
      continue;
    }
    if (c === ';') {
      stmts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\s*)+$/.test(s));
}

// DDL/DML (CREATE, INSERT, ...) return a row count, not a result set, so the
// driver requires execute() rather than query().
async function run(driver: ExasolDriver, sql: string) {
  await driver.execute(sql);
}

async function applyFile(driver: ExasolDriver, file: string) {
  const stmts = splitSql(readFileSync(join(process.cwd(), file), 'utf8'));
  for (const stmt of stmts) await run(driver, stmt);
  return stmts.length;
}

async function insertRows(
  driver: ExasolDriver,
  table: string,
  columns: string,
  tuples: string[],
  chunk = 400,
) {
  for (let i = 0; i < tuples.length; i += chunk) {
    const batch = tuples.slice(i, i + chunk);
    await run(driver, `INSERT INTO ${table} (${columns}) VALUES ${batch.join(', ')}`);
  }
}

async function main() {
  const driver = createDriver();
  await driver.connect();
  try {
    console.log(`→ Using data seed: ${SEED} (pass --seed N for a different dataset)`);
    console.log('→ Applying schema (db/schema.sql) ...');
    const schemaCount = await applyFile(driver, 'db/schema.sql');
    console.log(`  ${schemaCount} statements applied.`);

    // Anchor all generated time to the DB clock so "last 24h" / "this week" line up.
    const nowRow = (await driver.query('SELECT CURRENT_TIMESTAMP AS NOW').then((r) => r.getRows()))[0];
    const NOW = parseDbTs(String(nowRow.NOW));
    console.log(`→ DB clock anchor: ${new Date(NOW).toISOString()}`);

    // ----- dimensions -----
    const plantTuples = PLANTS.map((p) => `(${q(p.id)}, ${q(p.name)}, ${q(p.location)}, ${q(p.region)})`);
    const lineTuples = LINES.map((l) => `(${q(l.id)}, ${q(l.plant)}, ${q(l.name)})`);
    const machineTuples = MACHINES.map((m) => {
      const t = TYPE[m.type];
      const installAgoDays = 400 + Math.floor(rand() * 800);
      return `(${q(m.id)}, ${q(m.line)}, ${q(m.id + ' ' + m.type)}, ${q(m.type)}, ${q(t.model)}, ${dateLit(
        NOW - installAgoDays * DAY,
      )}, ${t.vib}, ${t.temp})`;
    });

    // ----- sensor readings: hourly for last 21 days -----
    const HOURS = 21 * 24;
    const sensorTuples: string[] = [];
    let rid = 1;
    for (const m of MACHINES) {
      const t = TYPE[m.type];
      for (let h = HOURS; h >= 0; h--) {
        const ms = NOW - h * HOUR;
        let vibFactor = 1;
        let tempBump = 0;
        if (m.id === 'M-102' && h <= 120) {
          // ramp from baseline (120h ago) up to +35% now
          const progress = 1 - h / 120;
          vibFactor = 1 + 0.35 * progress;
          tempBump = 6 * progress;
        } else if (m.id === 'M-107' && h <= 168) {
          vibFactor = 1.15;
          tempBump = 2;
        } else if (m.id === 'M-110' && h <= 168) {
          vibFactor = 1.1;
        }
        const vib = t.vib * vibFactor * noise(0.03);
        const temp = (t.temp + tempBump) * noise(0.02);
        const pressure = 5 * noise(0.05);
        const rpm = t.rpm * noise(0.02);
        sensorTuples.push(
          `(${rid++}, ${q(m.id)}, ${tsLit(ms)}, ${vib.toFixed(2)}, ${temp.toFixed(2)}, ${pressure.toFixed(
            2,
          )}, ${rpm.toFixed(1)})`,
        );
      }
    }

    // ----- error logs -----
    const errorTuples: string[] = [];
    let eid = 1;
    const addError = (machine: string, hoursAgo: number, code: string, sev: string, desc: string) =>
      errorTuples.push(
        `(${eid++}, ${q(machine)}, ${tsLit(NOW - hoursAgo * HOUR)}, ${q(code)}, ${q(sev)}, ${q(desc)})`,
      );

    // M-102: 4 severe errors in the last 24h (the headline)
    [2, 7, 14, 20].forEach((h, i) =>
      addError('M-102', h, ['E501', 'E512', 'E523', 'E501'][i], 'HIGH', 'High vibration / bearing fault'),
    );
    // M-107: repeated E521 across the week (1 within 24h, rest earlier)
    [10, 38, 70, 110, 150].forEach((h) =>
      addError('M-107', h, 'E521', 'MEDIUM', 'Vibration threshold exceeded'),
    );
    // M-115: repeated E210 across the week
    [16, 52, 90, 140].forEach((h) => addError('M-115', h, 'E210', 'LOW', 'Sensor drift detected'));
    // realistic low-severity scatter elsewhere
    ['M-104', 'M-109', 'M-113', 'M-117', 'M-106'].forEach((mc, i) =>
      addError(mc, 30 + i * 25, 'W101', 'LOW', 'Routine warning: minor parameter deviation'),
    );

    // ----- downtime events (Pune / P-B bad week) -----
    const downtimeTuples: string[] = [];
    let did = 1;
    const addDowntime = (machine: string, startHoursAgo: number, minutes: number, reason: string) => {
      const start = NOW - startHoursAgo * HOUR;
      downtimeTuples.push(
        `(${did++}, ${q(machine)}, ${tsLit(start)}, ${tsLit(start + minutes * 60_000)}, ${minutes.toFixed(
          1,
        )}, ${q(reason)})`,
      );
    };
    // P-B (Pune) bad week ~540 min in last 7d
    addDowntime('M-107', 30, 90, 'Bearing inspection — vibration alarm');
    addDowntime('M-107', 96, 90, 'Unplanned stop — vibration alarm');
    addDowntime('M-108', 50, 120, 'Tooling jam');
    addDowntime('M-110', 72, 150, 'Pump seal replacement');
    addDowntime('M-111', 120, 90, 'Controller fault');
    // elsewhere, smaller
    addDowntime('M-102', 18, 45, 'Unplanned stop — vibration alarm');
    addDowntime('M-117', 60, 60, 'Scheduled calibration overrun');
    // older events (8-14 days) for the trend view
    addDowntime('M-103', 9 * 24, 40, 'Belt adjustment');
    addDowntime('M-108', 11 * 24, 75, 'Tooling jam');
    addDowntime('M-114', 13 * 24, 55, 'Sensor replacement');

    // ----- maintenance records -----
    const maintTuples: string[] = [];
    let mrid = 1;
    const addMaint = (machine: string, lastAgoDays: number, nextInDays: number, type: string, notes: string) => {
      maintTuples.push(
        `(${mrid++}, ${q(machine)}, ${dateLit(NOW - lastAgoDays * DAY)}, ${q(type)}, ${dateLit(
          NOW + nextInDays * DAY,
        )}, ${q(notes)})`,
      );
    };
    for (const m of MACHINES) {
      if (m.id === 'M-110') {
        addMaint(m.id, 95, -10, 'PREVENTIVE', 'Quarterly service — NEXT SERVICE OVERDUE');
      } else {
        const lastAgo = 25 + Math.floor(rand() * 60);
        const nextIn = 15 + Math.floor(rand() * 60);
        addMaint(m.id, lastAgo, nextIn, 'PREVENTIVE', 'Routine preventive maintenance');
      }
    }

    // ----- bulk insert -----
    console.log('→ Inserting data ...');
    await insertRows(driver, 'PLANTOPS.PLANTS', 'PLANT_ID, PLANT_NAME, LOCATION, REGION', plantTuples);
    await insertRows(driver, 'PLANTOPS.PRODUCTION_LINES', 'LINE_ID, PLANT_ID, LINE_NAME', lineTuples);
    await insertRows(
      driver,
      'PLANTOPS.MACHINES',
      'MACHINE_ID, LINE_ID, MACHINE_NAME, MACHINE_TYPE, MODEL, INSTALL_DATE, VIBRATION_BASELINE, TEMP_BASELINE',
      machineTuples,
    );
    await insertRows(
      driver,
      'PLANTOPS.SENSOR_READINGS',
      'READING_ID, MACHINE_ID, TS, VIBRATION, TEMPERATURE, PRESSURE, RPM',
      sensorTuples,
    );
    await insertRows(
      driver,
      'PLANTOPS.ERROR_LOGS',
      'ERROR_ID, MACHINE_ID, TS, ERROR_CODE, SEVERITY, DESCRIPTION',
      errorTuples,
    );
    await insertRows(
      driver,
      'PLANTOPS.DOWNTIME_EVENTS',
      'EVENT_ID, MACHINE_ID, START_TS, END_TS, DOWNTIME_MINUTES, REASON',
      downtimeTuples,
    );
    await insertRows(
      driver,
      'PLANTOPS.MAINTENANCE_RECORDS',
      'RECORD_ID, MACHINE_ID, MAINT_DATE, MAINT_TYPE, NEXT_DUE_DATE, NOTES',
      maintTuples,
    );
    console.log(
      `  plants=${plantTuples.length} lines=${lineTuples.length} machines=${machineTuples.length} ` +
        `sensors=${sensorTuples.length} errors=${errorTuples.length} downtime=${downtimeTuples.length} maint=${maintTuples.length}`,
    );

    console.log('→ Applying views (db/views.sql) ...');
    const viewCount = await applyFile(driver, 'db/views.sql');
    console.log(`  ${viewCount} views applied.`);

    // ----- sanity summary -----
    console.log('\n=== Machines needing attention ===');
    const attention = await driver
      .query(
        'SELECT MACHINE_ID, PLANT_NAME, RISK_SCORE, RISK_BAND, VIBRATION_PCT_OVER_BASELINE, SEVERE_ERROR_COUNT_24H, DOWNTIME_MIN_7D FROM PLANTOPS.V_MACHINES_NEEDING_ATTENTION',
      )
      .then((r) => r.getRows());
    console.table(attention);

    console.log('=== Plant downtime (7d) ===');
    const pd = await driver
      .query('SELECT PLANT_NAME, DOWNTIME_MIN_7D, DOWNTIME_EVENTS_7D FROM PLANTOPS.V_PLANT_DOWNTIME_7D')
      .then((r) => r.getRows());
    console.table(pd);

    console.log('=== Repeated errors (7d) ===');
    const rep = await driver
      .query('SELECT MACHINE_ID, ERROR_CODE, OCCURRENCES_7D FROM PLANTOPS.V_REPEATED_ERRORS')
      .then((r) => r.getRows());
    console.table(rep);

    console.log('\n✅ Seed complete.');
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
