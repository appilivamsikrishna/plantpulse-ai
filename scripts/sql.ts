/**
 * Run arbitrary SQL against Exasol from the terminal.
 *   npm run sql -- "SELECT * FROM PLANTOPS.V_PLANT_HEALTH"
 *   npm run sql -- "UPDATE PLANTOPS.MACHINES SET VIBRATION_BASELINE = 3.2 WHERE MACHINE_ID = 'M-102'"
 *
 * SELECT/WITH/DESCRIBE/SHOW -> prints rows as a table.
 * Anything else (INSERT/UPDATE/DELETE/ALTER/CREATE...) -> runs and prints rows affected.
 * NOTE: no default schema is opened, so qualify objects as PLANTOPS.<name>.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const sql = process.argv.slice(2).join(' ').trim();
  if (!sql) {
    console.error('Usage: npm run sql -- "<SQL statement>"');
    process.exit(1);
  }
  const { withExasol } = await import('../lib/exasol');
  await withExasol(async (driver) => {
    if (/^\s*(select|with|describe|desc|show)\b/i.test(sql)) {
      const result = await driver.query(sql);
      const rows = result.getRows();
      console.log(`${rows.length} row(s):`);
      console.table(rows.slice(0, 200));
      if (rows.length > 200) console.log(`… (${rows.length - 200} more rows not shown)`);
    } else {
      const affected = await driver.execute(sql);
      console.log(`OK · ${affected} row(s) affected`);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('SQL error:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
