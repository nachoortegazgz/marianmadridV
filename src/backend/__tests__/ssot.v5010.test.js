/**
 * SUITE ESTATICAMENTE-EJECUTABLE SSOT v5010.1 (node --test)
 * MODULE: ssot.v5010.test | VERSION: v5010.1-QA | RESPONSIBILITY: regresiones criticas
 * FIXES: TST-02/03/04 automatizados + CONTRACTS TDZ/Ledger/Nomenclatura
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) { if (e !== 'node_modules') out.push(...walk(f)); }
    else if (f.endsWith('.js')) out.push(f);
  }
  return out;
}

const SRC = 'src';
const SELF = new Set([join('.', 'src', 'backend', '__tests__', 'ssot.v5010.test.js'), 'src/backend/__tests__/ssot.v5010.test.js']);
const allJs = () => walk(SRC).filter((f) => !f.endsWith('ssot.v5010.test.js'));
const read = (f) => readFileSync(f, 'utf8');

test('TST-02 G10 ASCII strict en todo src/', () => {
  for (const f of allJs()) {
    const bad = [...read(f)].find((c) => c.codePointAt(0) > 127);
    assert.equal(bad, undefined, `${f} contiene no-ASCII: ${bad}`);
  }
});

test('TST-03 SDK universal: cero wix-bookings legacy y cero require()', () => {
  for (const f of allJs()) {
    const s = read(f);
    assert.ok(!/from ['"]wix-bookings(\.v2)?['"]/.test(s), `${f}: import V1 wix-bookings`);
    assert.ok(!/require\(/.test(s), `${f}: require()`);
  }
  for (const f of ['bookingCore', 'bookingSaga']) {
    assert.match(read(`${SRC}/backend/booking/${f}.js`), /from ['"]@wix\/bookings['"]/, `${f} debe usar @wix/bookings`);
  }
});

test('TST-04 cero modulos zombie (archivos y referencias activas)', () => {
  for (const z of ['contabilidad.js', 'm365GraphSync.js', 'bookingServiceSync.js', 'http-functions.js', 'marianAssistant.web.js']) {
    assert.equal(existsSync(`${SRC}/backend/${z}`), false, `archivo zombie presente: ${z}`);
  }
  for (const f of allJs()) {
    const codeLines = read(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const joined = codeLines.join('\n');
    assert.ok(!/["']backend\/(contabilidad|bookingServiceSync|m365GraphSync)["']/.test(joined), `${f}: import zombie activo`);
    assert.ok(!/_proyectarAsientoContable\s*\(/.test(joined), `${f}: llamada zombie _proyectarAsientoContable`);
  }
});

test('CONTRACT-TDZ bookingCore: sin alias const/let sobre funciones antes de definicion (C-07)', () => {
  // v5010.7 (FASE 3 / CORE-08): _safeLockId se extrae 1:1 a
  // backend/booking/core/locks.js y bookingCore pasa a REEXPORTARLA desde la
  // fachada. El contrato TDZ (declaration con hoisting seguro, cero alias
  // const/let) se verifica ahora en el modulo que la define; ademas se exige
  // que la fachada siga exponiendola (contrato publico historico intacto).
  const locks = read(`${SRC}/backend/booking/core/locks.js`).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const core = read(`${SRC}/backend/booking/bookingCore.js`).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.match(locks, /function\s+_safeLockId\s*\(/, '_safeLockId debe estar definida como declaration (hoisting seguro) en core/locks.js');
  assert.match(core, /export\s*\{[^}]*_safeLockId[^}]*\}/s, 'la fachada bookingCore debe reexportar _safeLockId (contrato historico)');
  assert.ok(!/function\s+_safeLockId\s*\(/.test(core), 'bookingCore no debe redefinir _safeLockId (cero duplicacion de logica)');
  // Cero alias const/let sobre la funcion en AMBOS modulos (fachada y origen).
  for (const [name, src] of [['core', core], ['locks', locks]]) {
    assert.ok(!new RegExp('export\\s+(?:const|let)\\s+safeLockId\\b').test(src), `doble export safeLockId en ${name} (C-07)`);
    assert.ok(!new RegExp('export\\s+(?:const|let)\\s+_safeLockId\\s*=').test(src), `alias const _safeLockId prohibido (TDZ) en ${name}`);
    // Cualquier `const X = ... safeLockId(...)` debe aparecer despues de la declaracion.
    const defIdx = src.search(/function\s+_safeLockId\s*\(/);
    for (const m of src.matchAll(/(?:const|let)\s+\w+\s*=[^\n]*\bsafeLockId\s*\(/g)) {
      assert.ok(defIdx === -1 || m.index > defIdx, `alias const que invoca _safeLockId antes de su definicion (TDZ) en ${name}`);
    }
  }
});

test('CONTRACT-LEDGER cajas delega secuencia unica en eventLog', () => {
  const cajas = read(`${SRC}/backend/cajas.web.js`);
  const evlog = read(`${SRC}/backend/eventLog.js`);
  assert.match(cajas, /import\s*\{\s*_getNextSequenceInternal\s*\}\s*from\s*["']backend\/eventLog["']/, 'cajas debe importar _getNextSequenceInternal de eventLog');
  assert.match(evlog, /export\s+async\s+function\s+_getNextSequenceInternal|_getNextSequenceInternal[^\n]*export/, 'eventLog debe exportar _getNextSequenceInternal');
  const wrap = cajas.match(/async function _getNextSequence\(traceId\) \{[\s\S]{0,160}?\}/);
  if (wrap) assert.ok(wrap[0].includes('_getNextSequenceInternal('), 'wrapper local _getNextSequence debe delegar en eventLog (CONSOL-01)');
});

test('CONTRACT-NOMENCLATURA PROJECTION_STATUS canonico compartido', () => {
  const cfg = read(`${SRC}/backend/internalConfig.js`);
  assert.match(cfg, /PROJECTION_STATUS\s*=\s*Object\.freeze/, 'PROJECTION_STATUS congelado en internalConfig');
  assert.match(cfg, /PENDIENTE:\s*"PENDIENTE"/, 'valor PENDIENTE canonico (no PENDING)');
});

test('CONTRACT-SECURITY security.web expone roles sin bucle de redireccion', () => {
  const s = read(`${SRC}/backend/security.web.js`);
  assert.match(s, /isMarianManager|isAdmin|isCajero/, 'debe exponer roles C-02');
});
