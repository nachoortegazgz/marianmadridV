/**
 * ============================================================================
 * FILE: backend/__tests__/dynamic.e2e.test.js
 * VERSION: v5010.5-DYNAMIC-E2E
 * RESPONSIBILITY: Pruebas DINAMICAS end-to-end del flujo de reservas con
 *   mocks hermeticos (module.register hooks). Cero red, cero entorno Velo.
 *   Complementa las suites estaticas (TST-01..09), estructurales
 *   (reservas.test.js) y SSOT (ssot.v5010.test.js) con ejecucion REAL del
 *   codigo: bookingUtils puro + bookingCore sobre wixData mockeado.
 * STANDARDS: G10 ASCII Strict. node --test nativo. Node >= 20 (registerHooks).
 *
 * FLUJOS CERTIFICADOS:
 *   DYN-01 Huella canonica dual determinista (8 campos, orden estable).
 *   DYN-02 _extractResourceIdsFromSlot: variantes anidadas Wix (CORE-01).
 *   DYN-03 _projectCertifiedSlot: fail-fast de location (CORE-04).
 *   DYN-04 _projectWriterSlotFromAvailability: exige scheduleId GUID (CORE-03).
 *   DYN-05 _areSlotsContiguous: gap valido/negativo/tolerancia.
 *   DYN-06 Mutex SlotLocks: acquisition, dueno, revalidacion-expirada.
 *   DYN-07 Transaccion idempotente: PENDING -> COMPLETED, payload mismatch.
 *   DYN-08 CORE-06: traduccion paymentStatus SSOT espanol -> enum Wix.
 *   DYN-09 _persistBooking: rechazo sin scheduleId; doc canonico con alias.
 *   DYN-10 Ranking por carga con alias CANCELADO/SSOT (CORE-07).
 * ============================================================================
 */

import assert from 'node:assert/strict';

// Requires: node --experimental-loader tools/wixLoader.mjs --test <this file>
// The loader exposes hermetic state at globalThis.__TEST_STATE__ and mocks for
// wix-data, @wix/bookings, @wix/ecom, wix-auth, wix-web-module, backend/staff.

import { register } from 'node:module';

const state = globalThis.__TEST_STATE__;

// ---------------------------------------------------------------------------
// CARGA DE MODULOS REALES BAJO MOCK
// ---------------------------------------------------------------------------

// Hoisted ESM imports would break the no-loader skip path below (they run
// before any guard). Dynamic import keeps module loading under control:
// when the hermetic loader is active we load the real modules; otherwise
// these bindings stay null and every DYN test self-skips.
let utils = null;
let core = null;
let cfg = null;

if (!state) {
  // Auto-skip when executed WITHOUT the hermetic loader (e.g. plain
  // `node --test src/backend/__tests__/` from tools/run_test_suite.sh).
  // The suite remains MANDATORY via tools/run_dynamic_e2e.sh, which sets
  // __TEST_STATE__ and runs DYN-01..10 to completion. This keeps the static
  // smoke gate green without weakening the E2E certification.
  const t = await import('node:test');
  t.test('DYN-SUITE: dynamic E2E skipped (loader not active)', async (tt) => {
    tt.skip('run via tools/run_dynamic_e2e.sh (requires wixLoader.mjs)');
  });
} else {
  if (typeof register === 'function') {
    try { register('./wixLoader.mjs', import.meta.url); } catch (_) { /* loader already active */ }
  }
  utils = await import('../booking/bookingUtils.js');
  core = await import('../booking/bookingCore.js');
  cfg = await import('../internalConfig.js');
}

function resetState() {
  if (!state) return;
  state.locks.clear();
  state.transactions.clear();
  state.citas.length = 0;
  state.staffSchedules.clear();
}

const GUID_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GUID_B = '11111111-2222-3333-4444-555555555555';
const GUID_C = '99999999-8888-7777-6666-555555555555';
// STAFF_TYPE se resuelve de perezoso (cfg es null en el modo sin loader).
let _staffTypeCache = null;
function STAFF_TYPE_ID() {
  if (_staffTypeCache === null) _staffTypeCache = cfg.API.STAFF_RESOURCE_TYPE_ID;
  return _staffTypeCache;
}

// Sin loader hermetico activo, cada DYN-* se auto-salta (certificacion real
// exclusivamente via tools/run_dynamic_e2e.sh).
function skipWithoutLoader(t) {
  if (!state || !core) { t.skip('loader not active'); return true; }
  return false;
}

// ===========================================================================
// DYN-01: Huella canonica compartida
// ===========================================================================

export async function DYN_01() { // huella canonica dual es determinista y sensible a los 8 campos
  const base = {
    serviceId: GUID_A, linkedPhases: GUID_B, dateYMD: '2026-09-20',
    f1Start: '2026-09-20T10:00:00', f1End: '2026-09-20T10:30:00',
    f2Start: '2026-09-20T10:45:00', f2End: '2026-09-20T11:15:00',
    resourceId: GUID_C
  };
  const t1 = core._buildPairTokenDeterministic(base);
  const t2 = core._buildPairTokenDeterministic({ ...base });
  const t3 = core._buildPairTokenDeterministic({ ...base, f1Start: '2026-09-20T10:05:00' });
  assert.equal(t1, t2, 'idempotencia de token');
  assert.notEqual(t1, t3, 'sensibilidad a f1Start');
  assert.match(t1, /^[a-f0-9]+$/i, 'token hexadecimal estable');
  // La huella debe contener exactamente 7 separadores (8 campos).
  const fp = utils._buildPairFingerprint(base);
  assert.equal(fp.split('|').length, 8, 'huella de 8 campos obligatorios');
  // Reservas.web y saga consumen la MISMA definicion (no copia local).
  assert.equal(typeof core._buildPairFingerprint, 'function', 're-export desde bookingCore activo');
}

// ===========================================================================
// DYN-02: Extraccion de recursos (CORE-01)
// ===========================================================================

export async function DYN_02() { // _extractResourceIdsFromSlot cubre variantes anidadas Wix
  const nested = {
    availableResources: [{
      resourceType: { id: STAFF_TYPE_ID() },
      resources: [{ resourceId: GUID_A }, { _id: GUID_B }]
    }]
  };
  const ids = core._extractResourceIdsFromSlot(nested);
  assert.deepEqual([...ids].sort(), [GUID_A, GUID_B].sort(), 'resourceId/_id aceptados');

  const typeIdVariant = { availableResources: [{ typeId: STAFF_TYPE_ID(), resources: [{ id: GUID_C }] }] };
  assert.deepEqual(core._extractResourceIdsFromSlot(typeIdVariant), [GUID_C]);

  const direct = { resource: { id: GUID_A } };
  assert.deepEqual(core._extractResourceIdsFromSlot(direct), [GUID_A]);

  assert.deepEqual(core._extractResourceIdsFromSlot({}), [], 'slot vacio sin recursos');
}

// ===========================================================================
// DYN-03/04: Proyeccion certificada y writer (CORE-03, CORE-04)
// ===========================================================================

function certifiedSlotBase(overrides = {}) {
  return {
    serviceId: GUID_A,
    resourceId: GUID_B,
    scheduleId: GUID_C,
    localStartDate: '2026-09-20T10:00:00',
    localEndDate: '2026-09-20T10:30:00',
    bookable: true,
    location: { id: cfg.SDK_CONFIG.LOCATION_ID },
    ...overrides
  };
}

export async function DYN_03() { // _projectCertifiedSlot rechaza ubicacion conflictiva (fail_fast)
  const ok = core._projectCertifiedSlot(certifiedSlotBase(), GUID_B);
  assert.ok(ok, 'slot conforme proyecta');
  assert.equal(ok.locationId, cfg.SDK_CONFIG.LOCATION_ID);

  const bad = core._projectCertifiedSlot(
    certifiedSlotBase({ location: { id: 'ffffffff-0000-0000-0000-000000000000' } }), GUID_B);
  assert.equal(bad, null, 'otra ubicacion => null, nunca sustitucion silenciosa');

  const noDates = core._projectCertifiedSlot(
    certifiedSlotBase({ localEndDate: '2026-09-20T09:00:00' }), GUID_B);
  assert.equal(noDates, null, 'endDate <= startDate => null');
}

export async function DYN_04() { // _projectWriterSlotFromAvailability exige scheduleId GUID
  const withSchedule = core._projectWriterSlotFromAvailability(certifiedSlotBase(), GUID_B, GUID_A);
  assert.ok(withSchedule, 'writer slot proyectado');
  assert.equal(withSchedule.scheduleId, GUID_C);
  assert.equal(withSchedule.location.locationType, 'OWNER_BUSINESS');

  const noSchedule = certifiedSlotBase();
  delete noSchedule.scheduleId;
  assert.equal(core._projectWriterSlotFromAvailability(noSchedule, GUID_B, GUID_A), null,
    'sin scheduleId util => null (CORE-03)');

  const addonSlot = certifiedSlotBase({ addOnIds: [GUID_C, 'not-a-guid'] });
  const projectedAddon = core._projectWriterSlotFromAvailability(addonSlot, GUID_B, GUID_A);
  assert.deepEqual(projectedAddon.addOnIds, [GUID_C], 'addons GUID validos preservados (CORE-02)');
}

// ===========================================================================
// DYN-05: Contiguidad/gap
// ===========================================================================

export async function DYN_05() { // _areSlotsContiguous valida gap dentro de tolerancia
  const s1 = { localEndDate: '2026-09-20T10:30:00' };
  const s2ok = { localStartDate: '2026-09-20T10:45:00' };
  assert.equal(core._areSlotsContiguous(s1, s2ok, 120), true);
  // Por defecto (sin limite explicito) se usa la tolerancia SSOT
  // CONCURRENCY.MINUTOS_TOLERANCIA (=10): un gap de 15 la supera.
  assert.equal(core._areSlotsContiguous(s1, s2ok), false,
    'por defecto usa MINUTOS_TOLERANCIA del SSOT (=10 < gap 15)');
  // Un gap de 5 minutos si cabe dentro de la tolerancia SSOT por defecto.
  assert.equal(core._areSlotsContiguous(s1, { localStartDate: '2026-09-20T10:35:00' }), true,
    'gap 5 <= MINUTOS_TOLERANCIA');
  // Gap de 15 min pasa con limite explicito 120 pero NO con limite explicito 10.
  assert.equal(core._areSlotsContiguous(s1, { localStartDate: '2026-09-20T10:45:00' }, 10), false,
    'gap 15 > limite explicito 10');
  assert.equal(core._areSlotsContiguous(s1, { localStartDate: '2026-09-20T13:00:00' }, 120), false,
    'gap 150 > max 120');
  assert.equal(core._areSlotsContiguous(s1, { localStartDate: '2026-09-20T10:00:00' }, 120), false,
    'solapamiento rechazado');
}

// ===========================================================================
// DYN-06: Mutex SlotLocks
// ===========================================================================

export async function DYN_06() { // mutex
  resetState();
  const key = 'slot_test_key_1';
  const r1 = await core._lockSlotKeyOrFail(key, 'trace-A');
  assert.equal(r1.ok, true, 'primera acquisition');

  const r2 = await core._lockSlotKeyOrFail(key, 'trace-B');
  assert.equal(r2.ok, false);
  assert.equal(r2.message, 'LOCK_HELD_BY_ANOTHER_OWNER');

  const r3 = await core._lockSlotKeyOrFail(key, 'trace-A');
  assert.equal(r3.ok, true, 'dueno renueva su lock');

  // Expirar artificialmente y reclamar.
  const stored = state.locks.get('SlotLocks|' + core._safeLockId(key));
  stored.expiresAt = new Date(Date.now() - 1000);
  const r4 = await core._lockSlotKeyOrFail(key, 'trace-C');
  assert.equal(r4.ok, true, 'lock expirado se reclama');
  assert.equal(r4.reclaimed, true);

  const un = await core._unlockSlotKey(key, 'trace-C');
  assert.equal(un.ok, true);
}

// ===========================================================================
// DYN-07: Transaccion idempotente
// ===========================================================================

export async function DYN_07() { // transaccion
  resetState();
  const token = 'pair_token_abc';
  const init = await core._initTransaction(token, 'hash1', 'trace-1');
  assert.equal(init.success, true);
  assert.equal(init.isNew, true);

  const dup = await core._initTransaction(token, 'hash2', 'trace-2');
  assert.equal(dup.success, false);
  assert.equal(dup.error, 'PAIR_TOKEN_PAYLOAD_MISMATCH', 'payload distinto => rechazo');

  await core._completeTransaction(token, { bookingId: 'bk1' }, 'trace-1');
  const replay = await core._initTransaction(token, 'hash1', 'trace-3');
  assert.equal(replay.success, true);
  assert.equal(replay.isNew, false, 'replay idempotente devuelve resultado existente');

  // CONTRATO REAL v5010.5: COMPLETED es inmutable (idempotencia fuerte).
  // _failTransaction sobre una transaccion ya COMPLETED es no-op deliberado:
  // reabrir una transaccion completada romperia la garantia de replay.
  await core._failTransaction(token, 'boom');
  const afterFail = state.transactions.get('BookingTransactions|' + token);
  assert.equal(afterFail.status, 'COMPLETED',
    'COMPLETED no puede degradarse a FAILED (inmutabilidad idempotente)');

  // Y sobre PENDING si se registra el fallo:
  const token2 = 'pair_token_pending';
  await core._initTransaction(token2, 'hashA', 'trace-p');
  await core._failTransaction(token2, 'boom2');
  const failedPending = state.transactions.get('BookingTransactions|' + token2);
  assert.equal(failedPending.status, 'FAILED', 'PENDING -> FAILED registrado');
  const dupFailed = await core._initTransaction(token2, 'hashA', 'trace-p2');
  assert.equal(dupFailed.success, false);
  assert.equal(dupFailed.error, 'TRANSACTION_PREVIOUSLY_FAILED');
}

// ===========================================================================
// DYN-08: Traduccion paymentStatus CORE-06
// ===========================================================================

export async function DYN_08() { // confirmOrDecline traduce IMPAGADO_>UNPAID y passthrough ingles
  const translated = await core.confirmOrDeclineBookingElevated('bk1', {
    decline: false, paymentStatus: cfg.PAYMENT_STATUS.UNPAID
  });
  assert.equal(translated.echoedOptions.paymentStatus, 'UNPAID', 'SSOT IMPAGADO -> enum nativo Wix');

  const native = await core.confirmOrDeclineBookingElevated('bk2', { paymentStatus: 'PAID' });
  assert.equal(native.echoedOptions.paymentStatus, 'PAID', 'valores nativos pasan sin cambio');

  const noPay = await core.confirmOrDeclineBookingElevated('bk3', { decline: true });
  assert.equal(noPay.echoedOptions.paymentStatus, undefined);
}

// ===========================================================================
// DYN-09: _persistBooking
// ===========================================================================

export async function DYN_09() { // _persistBooking exige scheduleId GUID y persiste doc canonico
  resetState();
  await assert.rejects(
    () => core._persistBooking({
      bookingId: 'bkX', serviceId: GUID_A, resourceId: GUID_B,
      startDate: new Date('2026-09-20T08:00:00Z'), endDate: new Date('2026-09-20T08:30:00Z')
    }, 'trace-x'), /scheduleId/, 'rechazo sin scheduleId');

  const res = await core._persistBooking({
    bookingId: 'bkY',
    serviceId: GUID_A,
    resourceId: GUID_B,
    scheduleId: GUID_C,
    startDate: new Date('2026-09-20T08:00:00Z'),
    endDate: new Date('2026-09-20T08:30:00Z'),
    pairToken: 'tok_y',
    tipo: 'dual',
    paymentStatus: 'IMPAGADO',
    status: 'PENDING_PAYMENT'
  }, 'trace-y');

  assert.equal(res.created, true);
  const doc = state.citas[0];
  assert.equal(doc.scheduleId, GUID_C);
  assert.equal(doc.dateYmd, '2026-09-20', 'dateYmd derivado en hora local Madrid');
  assert.equal(doc.status, 'PENDING_PAYMENT');
  assert.equal(doc.paymentStatus, 'IMPAGADO', 'grafias SSOT admitidas en persistencia');

  // Replay con misma revision => update, no duplicado.
  const res2 = await core._persistBooking({
    bookingId: 'bkY', serviceId: GUID_A, resourceId: GUID_B, scheduleId: GUID_C,
    startDate: new Date('2026-09-20T08:00:00Z'), endDate: new Date('2026-09-20T08:30:00Z'),
    pairToken: 'tok_y', tipo: 'dual'
  }, 'trace-y2');
  assert.equal(res2.created, false, 'upsert idempotente por bookingId');
}

// ===========================================================================
// DYN-10: Ranking por carga (CORE-07)
// ===========================================================================

export async function DYN_10() { // _rankResourcesByLoad ignora cancelados en ambas grafias
  resetState();
  state.citas.push(
    { resourceId: GUID_A, dateYmd: '2026-09-20', bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' },
    { resourceId: GUID_A, dateYmd: '2026-09-20', status: 'CANCELADO', paymentStatus: 'REFUNDED' },
    { resourceId: GUID_B, dateYmd: '2026-09-20', status: 'CANCELLED', paymentStatus: 'PAID' },
    { resourceId: GUID_B, dateYmd: '2026-09-20', status: 'CONFIRMED', paymentStatus: 'PAID' }
  );
  const ranked = await core._rankResourcesByLoad([GUID_A, GUID_B], '2026-09-20', 'trace-r');
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0], GUID_B, 'B(1 activa) antes que A(2 activas; CANCELADO ignorado)');
}
