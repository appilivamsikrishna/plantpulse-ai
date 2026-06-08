/** Peek at the loaded mock data:  npm run peek */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const { queryRows } = await import('../lib/exasol');
  const show = async (title: string, sql: string) => {
    console.log(`\n=== ${title} ===`);
    console.table(await queryRows(sql));
  };

  await show(
    'Machines (18) — type, baseline, plant/line',
    `SELECT m.MACHINE_ID, m.MACHINE_TYPE, m.VIBRATION_BASELINE, p.PLANT_NAME, l.LINE_NAME
     FROM PLANTOPS.MACHINES m
     JOIN PLANTOPS.PRODUCTION_LINES l ON l.LINE_ID=m.LINE_ID
     JOIN PLANTOPS.PLANTS p ON p.PLANT_ID=l.PLANT_ID
     ORDER BY m.MACHINE_ID`,
  );

  await show(
    'M-102 vibration ramp — daily avg vs baseline 3.0 (last 7 days)',
    `SELECT TO_CHAR(TS,'YYYY-MM-DD') AS DAY_LABEL, ROUND(AVG(VIBRATION),2) AS AVG_VIB, ROUND(MAX(VIBRATION),2) AS MAX_VIB
     FROM PLANTOPS.SENSOR_READINGS
     WHERE MACHINE_ID='M-102' AND TS >= ADD_DAYS(CURRENT_TIMESTAMP,-7)
     GROUP BY TO_CHAR(TS,'YYYY-MM-DD') ORDER BY DAY_LABEL`,
  );

  await show(
    'M-102 errors (last 24h)',
    `SELECT TO_CHAR(TS,'YYYY-MM-DD HH24:MI') AS WHEN_, ERROR_CODE, SEVERITY, DESCRIPTION
     FROM PLANTOPS.ERROR_LOGS WHERE MACHINE_ID='M-102' AND TS >= ADD_HOURS(CURRENT_TIMESTAMP,-24) ORDER BY TS`,
  );

  await show(
    'Downtime events (last 7 days)',
    `SELECT d.MACHINE_ID, p.PLANT_NAME, d.DOWNTIME_MINUTES, d.REASON
     FROM PLANTOPS.DOWNTIME_EVENTS d
     JOIN PLANTOPS.MACHINES m ON m.MACHINE_ID=d.MACHINE_ID
     JOIN PLANTOPS.PRODUCTION_LINES l ON l.LINE_ID=m.LINE_ID
     JOIN PLANTOPS.PLANTS p ON p.PLANT_ID=l.PLANT_ID
     WHERE d.START_TS >= ADD_DAYS(CURRENT_TIMESTAMP,-7) ORDER BY p.PLANT_NAME, d.DOWNTIME_MINUTES DESC`,
  );

  await show(
    'Row counts per table',
    `SELECT 'sensor_readings' AS TBL, COUNT(*) AS ROW_COUNT FROM PLANTOPS.SENSOR_READINGS
     UNION ALL SELECT 'error_logs', COUNT(*) FROM PLANTOPS.ERROR_LOGS
     UNION ALL SELECT 'downtime_events', COUNT(*) FROM PLANTOPS.DOWNTIME_EVENTS
     UNION ALL SELECT 'maintenance_records', COUNT(*) FROM PLANTOPS.MAINTENANCE_RECORDS
     UNION ALL SELECT 'machines', COUNT(*) FROM PLANTOPS.MACHINES`,
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
