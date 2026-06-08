/** Quick connectivity check:  npm run exasol:ping */
import { config as loadEnv } from 'dotenv';
import { withExasol } from '../lib/exasol';

loadEnv({ path: '.env.local' });

withExasol(async (driver) => {
  const rows = await driver
    .query("SELECT CURRENT_TIMESTAMP AS NOW, CURRENT_USER AS USR, DBMS_VERSION_NAME() AS VER")
    .then((r) => r.getRows())
    .catch(async () => {
      // DBMS_VERSION_NAME may not exist on all versions; fall back.
      return (await driver.query('SELECT CURRENT_TIMESTAMP AS NOW, CURRENT_USER AS USR')).getRows();
    });
  console.log('✅ Connected to Exasol:', rows[0]);
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Exasol connection failed:', err?.message ?? err);
    process.exit(1);
  });
