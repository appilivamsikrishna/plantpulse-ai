/** End-to-end assistant test (no server):  npm run ask -- "your question" */
import { config as loadEnv } from 'dotenv';

async function main() {
  loadEnv({ path: '.env.local' });
  // dynamic import so env is loaded before the Anthropic client is constructed
  const { answerQuestion } = await import('../lib/assistant');

  const q = process.argv.slice(2).join(' ') || 'Why is M-102 high risk?';
  const r = await answerQuestion(q);

  console.log(`\nQ: ${q}\n`);
  console.log('ANSWER:\n' + r.answer + '\n');
  console.log('SUGGESTIONS: ' + (r.suggestions.length ? r.suggestions.join('  |  ') : '(none)') + '\n');
  console.log('TRACE:');
  for (const s of r.trace) {
    const d = s.detail ? ` — ${s.detail.slice(0, 140)}` : '';
    console.log(`  [${s.stage}] ${s.title}${d}`);
  }
  console.log(
    '\nEVIDENCE: ' +
      (r.evidence ? `${r.evidence.tool} · ${r.evidence.rowCount} row(s)\n  SQL: ${r.evidence.sql}` : 'none'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
