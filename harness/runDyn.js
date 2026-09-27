/*
MODULE: harness/runDyn.js
VERSION: v5010.7-FASE1
RESPONSIBILITY: Ejecuta DYN-01..10 como tests node:test REALES (con results
  por test) sobre el hermetic loader. Es el gate bloqueante de Fase 1.
  Reutiliza dynHarness.js (registro de hooks + __TEST_STATE__ + carga del
  modulo de casos) y aqui envuelve cada DYN_* en t.test().
STANDARDS: G10 ASCII strict.
*/
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import t from 'node:test';

const ROOT = path.resolve(process.cwd());

// Bare Velo specifiers resolved generically to REAL files under src/.
function realUrlFor(spec) {
  if (!spec.startsWith('backend/') && !spec.startsWith('public/')) return null;
  const abs = path.join(ROOT, 'src', spec + '.js');
  try { if (!fs.existsSync(abs)) return null; } catch (_) { return null; }
  return pathToFileURL(abs).href;
}

const { FAKE_SOURCES } = await import(pathToFileURL(path.join(ROOT, 'harness/fakeSources.js')).href);

const fakes = {};
for (const k of Object.keys(FAKE_SOURCES)) fakes[k] = FAKE_SOURCES[k];
const realFileUrls = {};
// Route-only entries: bare Velo specifiers that must resolve to REAL files.
// Includes every backend/booking/core/* module extracted from bookingCore
// (the loader's generic fallback cannot handle multi-segment specifiers).
const REAL_KEYS = [
  'backend/internalConfig',
  'backend/booking/bookingCore',
  'backend/booking/bookingSaga',
  'backend/booking/bookingUtils',
  'backend/booking/core/config',
  'backend/booking/core/errors',
  'backend/booking/core/loadRanking',
  'backend/booking/core/locks',
  'backend/booking/core/persistence',
  'backend/booking/core/scheduleResolver',
  'backend/booking/core/transactions',
  'backend/booking/core/validation',
  'public/mmUtils',
  'public/widgetBridge',
];
for (const k of REAL_KEYS) {
  const url = realUrlFor(k);
  if (url) { realFileUrls[k] = url; fakes[k] = null; }
}

register(pathToFileURL(path.join(ROOT, 'tools/wixLoader.mjs')).href, import.meta.url, {
  data: { fakes, realFileUrls },
});

await import('wix-data'); // self-initializes __WIX_FAKE__ in the APP realm
const S = globalThis.__WIX_FAKE__;
globalThis.__TEST_STATE__ = {
  get locks() { return S.locks; },
  get transactions() { return S.transactions; },
  get citas() { return S.citas; },
  get staffSchedules() { return S.staffSchedules; },
  get logs() { return S.logs; },
  get calls() { return S.calls; },
};

const mod = await import(pathToFileURL(path.join(ROOT, 'src/backend/__tests__/dynamic.e2e.test.js')).href);

const CASES = [
  ['DYN-01 huella canonica dual determinista', 'DYN_01'],
  ['DYN-02 extraccion de resourceIds (CORE-01)', 'DYN_02'],
  ['DYN-03 proyeccion certificada fail-fast (CORE-04)', 'DYN_03'],
  ['DYN-04 writer slot exige scheduleId (CORE-03)', 'DYN_04'],
  ['DYN-05 contiguidad/gap con tolerancia SSOT', 'DYN_05'],
  ['DYN-06 mutex SlotLocks (CORE-08)', 'DYN_06'],
  ['DYN-07 transaccion idempotente (reintento)', 'DYN_07'],
  ['DYN-08 traduccion paymentStatus (CORE-06)', 'DYN_08'],
  ['DYN-09 persistencia canonica CitasF2', 'DYN_09'],
  ['DYN-10 ranking por carga (CORE-07)', 'DYN_10'],
];

let executed = 0;
for (const [name, fn] of CASES) {
  if (typeof mod[fn] !== 'function') throw new Error('[runDyn] missing case ' + fn);
  t.test(name, async () => { await mod[fn](); executed++; });
}

t.after(() => {
  if (executed !== CASES.length) {
    throw new Error('[runDyn] incomplete suite: ' + executed + '/' + CASES.length);
  }
  console.log('[runDyn] suites completadas: ' + executed + '/' + CASES.length);
});
