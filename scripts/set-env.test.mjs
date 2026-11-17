import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEnv } from './set-env.mjs';

const SRC = `export const environment = {
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
  vapidPublicKey: '__VAPID_PUBLIC_KEY__',
};`;
const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_1',
  VAPID_PUBLIC_KEY: 'BPk',
};

test('sustituye los tres marcadores por literales', () => {
  const out = applyEnv(SRC, ENV);
  assert.match(out, /supabaseUrl: "https:\/\/x\.supabase\.co"/);
  assert.match(out, /supabaseAnonKey: "sb_publishable_1"/);
  assert.match(out, /vapidPublicKey: "BPk"/);
  assert.doesNotMatch(out, /__[A-Z_]+__/);
});

test('falla si falta una variable', () => {
  assert.throws(
    () => applyEnv(SRC, { ...ENV, VAPID_PUBLIC_KEY: undefined }),
    /Falta la variable VAPID_PUBLIC_KEY/,
  );
});

test('falla si una variable está vacía', () => {
  assert.throws(
    () => applyEnv(SRC, { ...ENV, SUPABASE_URL: '  ' }),
    /Falta la variable SUPABASE_URL/,
  );
});

test('falla si el archivo ya no tiene el marcador', () => {
  assert.throws(
    () => applyEnv(applyEnv(SRC, ENV), ENV),
    /No se encuentra el marcador __SUPABASE_URL__/,
  );
});

test('escapa comillas y barras', () => {
  const out = applyEnv(SRC, { ...ENV, SUPABASE_ANON_KEY: `a'b"c\\d` });
  assert.ok(out.includes(`supabaseAnonKey: ${JSON.stringify(`a'b"c\\d`)}`));
});
