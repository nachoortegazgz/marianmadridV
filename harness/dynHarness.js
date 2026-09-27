/*
MODULE: harness/dynHarness.js
VERSION: v5010.7-FASE1
RESPONSIBILITY: Entry point del gate dinamico DYN-01..10.
  1) Registra los hooks ESM (tools/wixLoader.mjs, worker thread) pasando el
     REGISTRO DE RUTAS + fuentes de fakes via register(data). Las fuentes son
     autocontenidas y se evaluan en el realm de la app => el estado vive en
     globalThis.__WIX_FAKE__ del HILO PRINCIPAL (cero doble instancia; ver
     artifacts/loader-double-instance-repro.md).
  2) Publica __TEST_STATE__ como PROXY hacia ese mismo store.
  3) Importa src/backend/__tests__/dynamic.e2e.test.js (que detecta
     __TEST_STATE__, importa los modulos REALES bajo mock y ejecuta DYN-01..10).
STANDARDS: G10 ASCII strict. Node >= 20 (module.register).
*/

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { FAKE_SOURCES } from './fakeSources.js';

const ROOT = path.resolve(process.cwd());

// Bare Velo specifiers resolved generically: 'backend/x' -> src/backend/x.js,
// 'public/x' -> src/public/x.js (paridad 1:1 con la resolucion de Velo).
function realUrlFor(spec) {
  if (!spec.startsWith('backend/') && !spec.startsWith('public/')) return null;
  const rel = spec.replace(/\.(js|jst)$/,'') + '.js';
  const abs = path.join(ROOT, 'src', rel);
  try { if (!fs.existsSync(abs)) return null; } catch (_) { return null; }
  return pathToFileURL(abs).href;
}

const BARE_REAL = [
  'backend/internalConfig',
  'backend/booking/bookingCore',
  'backend/booking/bookingUtils',
  'backend/booking/core/locks',
  'public/mmUtils',
  'public/widgetBridge',
];

const fakes = {};
for (const k of Object.keys(FAKE_SOURCES)) fakes[k] = FAKE_SOURCES[k];
const realFileUrls = {};
for (const k of BARE_REAL) { realFileUrls[k] = realUrlFor(k); fakes[k] = null; }

register(pathToFileURL(path.join(ROOT, 'tools/wixLoader.mjs')).href, import.meta.url, {
  data: { fakes, realFileUrls },
});

// The fakes self-initialize on first evaluation in the APP realm. To publish
// __TEST_STATE__ BEFORE the test module body runs, pre-evaluate wix-data now.
await import('wix-data');

const S = globalThis.__WIX_FAKE__;
globalThis.__TEST_STATE__ = {
  get locks() { return S.locks; },
  get transactions() { return S.transactions; },
  get citas() { return S.citas; },
  get staffSchedules() { return S.staffSchedules; },
  get logs() { return S.logs; },
  get calls() { return S.calls; },
};

const testPath = path.join(ROOT, 'src/backend/__tests__/dynamic.e2e.test.js');
await import(pathToFileURL(testPath).href);
