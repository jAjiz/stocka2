// Escribe las variables de producción en src/environments/environment.ts antes de `ng build`
// (spec §9). Se ejecuta en el build de Cloudflare; sustituir después del build rompería los
// hashes de ngsw.json. Si falta alguna variable o algún marcador, falla y el build no publica.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VARIABLES = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VAPID_PUBLIC_KEY'];

/** Sustituye cada `'__NOMBRE__'` por el valor de la variable como literal de cadena. */
export function applyEnv(source, env) {
  let out = source;
  for (const name of VARIABLES) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Falta la variable ${name}.`);
    const marker = `'__${name}__'`;
    if (!out.includes(marker)) throw new Error(`No se encuentra el marcador __${name}__.`);
    out = out.replace(marker, () => JSON.stringify(value));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = fileURLToPath(new URL('../src/environments/environment.ts', import.meta.url));
  try {
    writeFileSync(file, applyEnv(readFileSync(file, 'utf8'), process.env));
    console.log('environment.ts listo para producción.');
  } catch (e) {
    console.error(`set-env: ${e.message}`);
    process.exit(1);
  }
}
