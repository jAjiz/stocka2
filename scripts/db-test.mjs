// Ejecuta solo supabase/tests/*.test.sql (excluye _helpers.sql, que no es un test).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('supabase/tests')
  .filter((f) => f.endsWith('.test.sql'))
  .sort()
  .map((f) => `supabase/tests/${f}`);
const r = spawnSync('pnpm', ['exec', 'supabase', 'test', 'db', ...files], {
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
