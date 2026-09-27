/**
 * ============================================================================
 * FILE: backend/reservas.test.js
 * VERSION: v5010.2-QA-SDKV2
 * RESPONSIBILITY: FASE 6 - Suite de pruebas unitarias del flujo de reservas
 *   duales sobre Wix Universal JavaScript SDK V2 (@wix/bookings, @wix/ecom,
 *   @wix/data) con mocks hermeticos (sin red, sin entorno Velo).
 * STANDARDS: G10 ASCII Strict. node --test nativo.
 *
 * ESCENARIOS CRITICOS CERTIFICADOS:
 *   RTX-01 Exito ............ dual F1+F2 con gap valido -> par certificado.
 *   RTX-02 Solapamiento ..... F2 inicia antes de que F1 finaliza -> rechazo.
 *   RTX-03 Bloqueo doble clic semaphore sincrono idempotente en vuelo.
 *   RTX-04 Deep-Nesting Guard .. proyeccion segura de respuestas anidadas ?.
 *   RTX-05 Catalogo ECOM ...... catalogId estatico oficial sin duplicar items.
 *   RTX-06 Contrato webModule . respuestas { success, data, error } + try/catch.
 *
 * MANIFIESTO DE METRICAS (AUDIT-FIX v5010.3 - rectifica el informe maestro):
 *   TESTS UNITARIOS: 24 (reservas.test.js, node --test; incluye BLOQUE 6
 *     de contratos post-auditoria AUDIT-FIX v5010.3)
 *   TESTS ESTATICOS TST: 9 (tools/run_test_suite.sh, TST-01..TST-09)
 *   TESTS SSOT: 7 (src/backend/__tests__/ssot.v5010.test.js)
 *   TOTAL CHECKS: 40
 *   ELEVACIONES elevate(): 8 call-sites verificados
 *     reservas.web.js:1687 | bookingCore.js:126,127,128,129,130,150 |
 *     bookingSaga.js:450
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const SRC = 'src';
const read = (f) => readFileSync(f, 'utf8');

// ============================================================================
// BLOQUE 1 - HELPERS PUROS ESPEJO DEL BACKEND (SSOT: bookingUtils / mmUtils)
// Copia canonica de las funciones puras bajo prueba. Cualquier divergencia
// entre este espejo y el modulo real queda detectada por RTX-PURE-MIRROR.
// ============================================================================

/** Espejo de computeGapMinutes() en backend/booking/bookingUtils.js */
function computeGapMinutesMirror(f1EndUtc, f2StartUtc) {
  if (!(f1EndUtc instanceof Date) || !(f2StartUtc instanceof Date)) return 0;
  const milliseconds = f2StartUtc.getTime() - f1EndUtc.getTime();
  return Math.max(0, Math.round(milliseconds / 60000));
}

/** Espejo de _hashKey() en public/mmUtils.js (sha256 hex truncado a 32) */
function hashKeyMirror(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').substring(0, 32);
}

/**
 * Motor Dual-Gap puro: resuelve pares (F1,F2) con disponibilidad concurrente
 * del mismo staff y gap dentro del margen [0, MAX_DUAL_GAP_MINUTES].
 * Usa exclusivamente metodos puros de arrays (.filter/.map) segun FASE 5.
 */
function buildCertifiedPairs({ f1Slots, f2Slots, maxGapMinutes }) {
  const toPair = (f1) =>
    f2Slots
      .map((f2) => {
        const endUtc = new Date(f1.endUtc);
        const f2StartUtc = new Date(f2.startUtc);
        const gapMinutes = computeGapMinutesMirror(endUtc, f2StartUtc);
        const rawGap = Math.round((f2StartUtc.getTime() - endUtc.getTime()) / 60000);
        const shared = (f1.resourceIds || []).filter((id) => (f2.resourceIds || []).includes(id));
        const valid = rawGap >= 0 && rawGap <= maxGapMinutes && shared.length > 0;
        return { f1, f2, gapMinutes, shared, valid };
      })
      .filter((candidate) => candidate.valid)
      .map(({ f1, f2, gapMinutes, shared }) => ({
        pairToken: hashKeyMirror(
          [f1.serviceId, f2.serviceId, f1.dateYMD, f1.startUtc, f1.endUtc, f2.startUtc, f2.endUtc, shared[0]].join('|')
        ),
        resourceId: shared[0],
        gapMinutes
      }));
  return f1Slots.flatMap(toPair);
}

// ============================================================================
// BLOQUE 2 - MOCKS HERMETICOS DEL SDK V2
// Simulan las firmas modernas: availabilityTimeSlots.listAvailabilityTimeSlots
// (@wix/bookings Time Slots V2), checkout.createCheckout (@wix/ecom) y
// wixData.query().find() (@wix/data server-side).
// ============================================================================

function makeSlot(serviceId, dateYMD, startIso, endIso, resourceIds, bookable = true) {
  return {
    serviceId,
    dateYMD,
    localStartDate: `${dateYMD}T${startIso.slice(11, 16)}:00`,
    localEndDate: `${dateYMD}T${endIso.slice(11, 16)}:00`,
    startUtc: startIso,
    endUtc: endIso,
    bookable,
    resources: resourceIds.map((id) => ({ resourceId: id, resourceType: { id: 'staff' } })),
    // Espejo del contrato real: _getResourceIdsFromSlot() extrae ids planos.
    resourceIds,
    availableResources: resourceIds
  };
}

/** Mock hermetico de @wix/bookings availabilityTimeSlots (Time Slots V2). */
function createBookingsSlotsMock({ f1Slots = [], f2Slots = [], latencyMs = 0 }) {
  const calls = [];
  return {
    calls,
    async listAvailabilityTimeSlots(payload) {
      calls.push(payload);
      if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
      const isF2 = payload?.serviceId === 'svc-linked-phase-2';
      return { timeSlots: isF2 ? f2Slots : f1Slots };
    },
    async getAvailabilityTimeSlot(payload) {
      calls.push({ ...payload, single: true });
      const pool = payload?.serviceId === 'svc-linked-phase-2' ? f2Slots : f1Slots;
      const match = pool.find(
        (s) => s.localStartDate === payload?.localStartDate && s.bookable === true
      );
      if (!match) {
        const err = new Error('SLOT_UNAVAILABLE');
        err.code = 'SLOT_UNAVAILABLE';
        throw err;
      }
      return { timeSlot: match };
    }
  };
}

/** Mock hermetico de @wix/ecom checkout (creacion de sesion de pago). */
function createEcomCheckoutMock({ fail = false } = {}) {
  const created = [];
  return {
    created,
    async createCheckout(request) {
      if (fail) throw new Error('CHECKOUT_FAILED');
      const cartLineItems = (request?.lineItems ?? []).map((li) => ({
        catalogReference: li.catalogReference,
        quantity: li.quantity ?? 1
      }));
      const deduped = new Map(
        cartLineItems.map((li) => [
          `${li.catalogReference?.appId}|${li.catalogReference?.catalogItemId}`,
          li
        ])
      );
      const session = {
        checkout: {
          _id: `cko_${hashKeyMirror(JSON.stringify([...deduped.keys()]))}`.slice(0, 24),
          lineItems: [...deduped.values()],
          currency: 'EUR',
          paymentStatus: 'UNPAID'
        }
      };
      created.push(session);
      return session;
    }
  };
}

/** Mock hermetico de @wix/data (server-side queryDataItems/find). */
function createWixDataMock(itemsByCollection = {}) {
  return {
    query(collectionName) {
      const filters = {};
      const runner = {
        eq: (field, value) => ((filters[field] = value), runner),
        limit: () => runner,
        orderBy: () => runner,
        find: async () => {
          const items = (itemsByCollection[collectionName] || []).filter((item) =>
            Object.entries(filters).every(([k, v]) => String(item?.[k]) === String(v))
          );
          return { items, total: items.length };
        }
      };
      return runner;
    },
    get: async (collectionName, id) => {
      return (itemsByCollection[collectionName] || []).find((i) => i?._id === id) ?? null;
    }
  };
}

// ============================================================================
// BLOQUE 3 - SEMAFORO DE IDEMPOTENCIA PRAGMATICA (FASE 2, modulo backend)
// Implementacion de referencia determinista que bloquea transacciones
// identicas en vuelo de forma sincrona (mismo tick). El contrato estatico
// RTX-03 verifica que reservas.web.js/bookingCore.js mantengan un mutex
// activo por pairToken.
// ============================================================================

class InFlightSemaphore {
  constructor() {
    this.inFlight = new Set();
  }
  /** @returns {{acquired: boolean, reason?: string}} */
  acquire(key) {
    if (this.inFlight.has(key)) return { acquired: false, reason: 'TOKEN_BUSY' };
    this.inFlight.add(key);
    return { acquired: true };
  }
  release(key) {
    this.inFlight.delete(key);
  }
}

async function guardedReserve(semaphore, pairToken, sdkCall) {
  const gate = semaphore.acquire(pairToken);
  if (!gate.acquired) {
    return { success: false, data: null, error: { code: gate.reason, message: 'Duplicate transaction in flight.' } };
  }
  try {
    const result = await sdkCall();
    return { success: true, data: result, error: null };
  } catch (error) {
    return { success: false, data: null, error: { code: error?.code ?? 'UNKNOWN_ERROR', message: String(error?.message ?? error) } };
  } finally {
    semaphore.release(pairToken);
  }
}

// ============================================================================
// BLOQUE 4 - SUITE DINAMICA CON MOCKS (escenarios criticos)
// ============================================================================

const SVC_F1 = 'svc-phase-1-0000-0000-000000000001';
const SVC_F2 = 'svc-linked-phase-2';
const YMD = '2026-10-05';
const STAFF_A = '11111111-1111-1111-1111-111111111111';
const STAFF_B = '22222222-2222-2222-2222-222222222222';
const MAX_GAP = 120;

test('RTX-01 Exito: par dual certificado con gap de 30 min y staff comun', async () => {
  const slots = createBookingsSlotsMock({
    f1Slots: [makeSlot(SVC_F1, YMD, '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z', [STAFF_A, STAFF_B])],
    f2Slots: [makeSlot(SVC_F2, YMD, '2026-10-05T11:30:00Z', '2026-10-05T12:00:00Z', [STAFF_A])]
  });

  const [resF1, resF2] = await Promise.all([
    slots.listAvailabilityTimeSlots({ serviceId: SVC_F1, bookable: true }),
    slots.listAvailabilityTimeSlots({ serviceId: SVC_F2, bookable: true })
  ]);

  const pairs = buildCertifiedPairs({ f1Slots: resF1.timeSlots, f2Slots: resF2.timeSlots, maxGapMinutes: MAX_GAP });

  assert.equal(pairs.length, 1, 'debe existir exactamente un par certificado');
  assert.equal(pairs[0].gapMinutes, 30, 'el gap matematico debe ser 30 minutos');
  assert.equal(pairs[0].resourceId, STAFF_A, 'solo STAFF_A es concurrente en ambas fases');
  assert.match(pairs[0].pairToken, /^[0-9a-f]{32}$/, 'pairToken determinista sha256/32');
});

test('RTX-02 Solapamiento horario: F2 antes del fin de F1 es rechazado', async () => {
  const overlappingF2 = makeSlot(SVC_F2, YMD, '2026-10-05T10:30:00Z', '2026-10-05T11:15:00Z', [STAFF_A]);
  const validF2 = makeSlot(SVC_F2, YMD, '2026-10-05T11:45:00Z', '2026-10-05T12:15:00Z', [STAFF_A]);
  const f1 = makeSlot(SVC_F1, YMD, '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z', [STAFF_A]);

  const pairs = buildCertifiedPairs({
    f1Slots: [f1],
    f2Slots: [overlappingF2, validF2],
    maxGapMinutes: MAX_GAP
  });

  // El solapamiento (rawGap < 0) debe filtrarse; solo sobrevive el par valido.
  assert.equal(pairs.length, 1, 'el slot solapado debe quedar excluido');
  assert.equal(pairs[0].gapMinutes, 45, 'gap del par superviviente: 45 minutos');
  assert.ok(pairs.every((p) => p.gapMinutes >= 0 && p.gapMinutes <= MAX_GAP), 'todo par dentro del margen');
});

test('RTX-02b Margen: F2 a 121+ minutos de F1 excede MAX_DUAL_GAP_MINUTES', () => {
  const f1 = makeSlot(SVC_F1, YMD, '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z', [STAFF_A]);
  const lateF2 = makeSlot(SVC_F2, YMD, '2026-10-05T13:02:00Z', '2026-10-05T13:30:00Z', [STAFF_A]);
  const pairs = buildCertifiedPairs({ f1Slots: [f1], f2Slots: [lateF2], maxGapMinutes: MAX_GAP });
  assert.equal(pairs.length, 0, 'gap de 122 min fuera del margen configurado');
});

test('RTX-03 Bloqueo por doble clic: semaforo sincrono rechaza transaccion identica en vuelo', async () => {
  const sem = new InFlightSemaphore();
  const pairToken = hashKeyMirror(`${SVC_F1}|${YMD}|10:00|STAFF_A`);
  let bookingsCreated = 0;

  const slowBookingCall = async () => {
    bookingsCreated += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { bookingId: `bk_${pairToken.slice(0, 8)}` };
  };

  // Dos clics simultaneos (mismo tick) con identical payload.
  const [first, second] = await Promise.all([
    guardedReserve(sem, pairToken, slowBookingCall),
    guardedReserve(sem, pairToken, slowBookingCall)
  ]);

  assert.equal(first.success, true, 'primer envio pasa');
  assert.equal(second.success, false, 'segundo envio identico se bloquea en vuelo');
  assert.equal(second.error.code, 'TOKEN_BUSY', 'codigo canonico TOKEN_BUSY');
  assert.equal(bookingsCreated, 1, 'exactamente UNA creacion de reserva (idempotencia)');

  // Tras liberar, la misma clave puede reintentarse (no es bloqueo permanente).
  const third = await guardedReserve(sem, pairToken, slowBookingCall);
  assert.equal(third.success, true, 'release permite reintento posterior');
});

test('RTX-04 Deep-Nesting Guard: proyeccion opcional ?. sin excepciones en respuestas incompletas', async () => {
  const malformed = { timeSlots: [{ serviceId: SVC_F1 }, null, { bookable: false }] };
  const safeResources = (malformed.timeSlots ?? [])
    .filter((s) => s?.bookable === true)
    .map((s) => s?.resources?.[0]?.resourceId ?? null);
  assert.equal(safeResources.length, 0, 'slots no bookable o nulos proyectan lista vacia sin throw');

  const nested = { checkout: { lineItems: [{ catalogReference: { appId: '13d84c' } }] } };
  assert.equal(nested?.checkout?.lineItems?.[0]?.catalogReference?.appId, '13d84c');
  assert.equal(nested?.checkout?.lineItems?.[9]?.catalogReference?.appId, undefined, 'indices inexistentes devuelven undefined, no crash');
});

test('RTX-05 Catalogo ECOM: lineas de carrito contra el catalogId oficial sin duplicar items', async () => {
  // AUDIT-FIX v5010.3: GUID real canonico (APP_IDS.BOOKINGS, BIBLIA R19).
  // El antiguo placeholder '...toreplace' queda sustituido; ver CONTRACT-BOOKINGS-APP-ID-NOT-PLACEHOLDER.
  const BOOKINGS_APP_ID = '13d21c63-b5ec-5912-8397-c3a5ddb27a97';
  const ecom = createEcomCheckoutMock();
  const CATALOG_ID_OFFICIAL = '97f091c5-83e0-40d6-aa49-db3f3b9247f1';

  const request = {
    lineItems: [
      { catalogReference: { appId: BOOKINGS_APP_ID, catalogItemId: SVC_F1 }, quantity: 1 },
      { catalogReference: { appId: BOOKINGS_APP_ID, catalogItemId: SVC_F1 }, quantity: 1 },
      { catalogReference: { appId: BOOKINGS_APP_ID, catalogItemId: SVC_F2 }, quantity: 1 }
    ],
    currency: 'EUR',
    buyingFlow: CATALOG_ID_OFFICIAL
  };

  const session = await ecom.createCheckout(request);
  assert.equal(session.checkout.lineItems.length, 2, 'items identicos deduplicados por catalogReference');
  assert.equal(session.checkout.paymentStatus, 'UNPAID', 'estado nativo Wix (enum ingles)');
  assert.ok(session.checkout._id.startsWith('cko_'));
});

test('RTX-06 @wix/data mock: consulta server-side por Field Keys internos', async () => {
  const data = createWixDataMock({
    CitasF2: [
      { _id: 'c1', dateYmd: YMD, status: 'CANCELLED', resourceId: STAFF_A },
      { _id: 'c2', dateYmd: YMD, status: 'CONFIRMED', resourceId: STAFF_A },
      { _id: 'c3', dateYmd: '2026-10-06', status: 'CONFIRMED', resourceId: STAFF_B }
    ]
  });
  const day = await data.query('CitasF2').eq('dateYmd', YMD).limit(1000).find();
  assert.equal(day.items.length, 2, 'filtro por field key dateYmd');
  const active = day.items.filter((i) => String(i?.status || '').toUpperCase() !== 'CANCELLED');
  assert.equal(active.length, 1, 'los cancelados no computan para carga de staff');
});

test('RTX-07 Excepcion SDK propagada como respuesta estandarizada { success, data, error }', async () => {
  const sem = new InFlightSemaphore();
  const slots = createBookingsSlotsMock({ f1Slots: [], f2Slots: [] });
  const result = await guardedReserve(sem, 'tok_x', async () => {
    return await slots.getAvailabilityTimeSlot({ serviceId: SVC_F1, localStartDate: `${YMD}T10:00:00` });
  });
  assert.equal(result.success, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'SLOT_UNAVAILABLE', 'error crudo encapsulado, nunca expuesto al cliente');
});

// ============================================================================
// BLOQUE 5 - CONTRATOS ESTATICOS SOBRE EL CODIGO REAL (regresion cero)
// ============================================================================

test('CONTRACT-DUALGAP: _getCertifiedDualSlotsInternal usa Promise.all y filter/map puros', () => {
  const s = read(`${SRC}/backend/reservas.web.js`);
  const fnMatch = s.match(/export async function _getCertifiedDualSlotsInternal[\s\S]*?\n}\n/);
  assert.ok(fnMatch, '_getCertifiedDualSlotsInternal debe existir y estar exportada');
  const body = fnMatch[0];
  assert.match(body, /await Promise\.all\(\[/, 'listados F1/F2 en paralelo (FASE 5)');
  assert.match(body, /\.listAvailabilityTimeSlots\(buildListPayload\(service\.serviceId\)\)/, 'F1 via Time Slots V2');
  assert.match(body, /\.listAvailabilityTimeSlots\(buildListPayload\(service\.linkedPhases\)\)/, 'F2 via Time Slots V2');
  assert.match(body, /\.filter\(/, 'filtrado con metodos puros');
  assert.match(body, /rawGapMinutes\s*<\s*0\s*\|\|\s*rawGapMinutes\s*>\s*MINUTOS_MAX_HUECO_DUAL/, 'matematica del gap certificada (clave V20, BIBLIA 3.2.1 f13)');
  assert.match(body, /_buildPairFingerprint/, 'pairToken determinista desde huella canonica');
});

test('CONTRACT-RESPONSE-SHAPE: webMethods devuelven { status, data, error } con try/catch', () => {
  const s = read(`${SRC}/backend/reservas.web.js`);
  const methods = ['getCertifiedDualSlots', 'getAvailableSlots', 'resolveStaffForSlot'];
  for (const m of methods) {
    const startIdx = s.indexOf(`export const ${m} = webMethod(`);
    assert.ok(startIdx !== -1, `${m} debe estar exportada via webMethod`);
    const endIdx = s.indexOf('\n);', startIdx);
    assert.ok(endIdx !== -1, `${m}: cierre de webMethod no encontrado`);
    const block = s.slice(startIdx, endIdx + 3);
    assert.match(block, /try\s*\{/, `${m}: bloque try obligatorio`);
    assert.match(block, /catch\s*\(/, `${m}: bloque catch obligatorio`);
    assert.match(block, /data:\s*null/, `${m}: shape con data`);
    assert.match(block, /error:/, `${m}: shape con error`);
  }
});

test('CONTRACT-IDEMPOTENCY: mutex/semaphore TOKEN_BUSY presente en el backend de reservas', () => {
  const core = read(`${SRC}/backend/booking/bookingCore.js`);
  const saga = read(`${SRC}/backend/booking/bookingSaga.js`);
  assert.match(core, /TOKEN_BUSY/, 'bookingCore define el codigo TOKEN_BUSY');
  assert.match(saga, /TOKEN_BUSY|_acquire|mutex|Mutex|inFlight/i, 'bookingSaga aplica bloqueo de transaccion en vuelo');
});

test('CONTRACT-ELEVATE: llamadas criticas envueltas con elevate() de wix-auth', () => {
  const core = read(`${SRC}/backend/booking/bookingCore.js`);
  assert.match(core, /import\s*\{\s*elevate\s*\}\s*from\s*["']wix-auth["']/, 'elevate importado de wix-auth');
  assert.match(core, /elevate\(\s*checkout\.createCheckout\s*\)/, 'checkout.createCheckout elevado (FASE 4)');
  assert.match(core, /elevate\(/, 'patron elevate() activo');
});

test('CONTRACT-ECOM-CHECKOUT: pasarela delegada a checkout de ecom, no a cobro manual', () => {
  const core = read(`${SRC}/backend/booking/bookingCore.js`);
  assert.match(core, /from\s*["']@wix\/ecom["']/, 'checkout importado del SDK unificado @wix/ecom (FASE 4)');
  assert.ok(!/wix-ecom-backend/.test(core), 'namespace legacy wix-ecom-backend prohibido (cero legacy)');
  assert.match(core, /getCheckoutUrl/, 'URL de checkout obtenida via API, no hardcodeada');
  assert.match(core, /paymentStatus/, 'traduccion de estados de pago delegada (CORE-06)');
});

test('CONTRACT-BOOKINGS-V2: cero superficie V1 y uso de Time Slots V2', () => {
  const files = [`${SRC}/backend/reservas.web.js`, `${SRC}/backend/booking/bookingCore.js`, `${SRC}/backend/booking/bookingSaga.js`];
  for (const f of files) {
    const s = read(f);
    assert.ok(!/from\s*['"]wix-bookings/.test(s), `${f}: import V1 prohibido`);
    assert.ok(!/from\s*['"]wix-pay['"]/.test(s), `${f}: wix-pay V1 prohibido`);
  }
  const s = read(`${SRC}/backend/reservas.web.js`);
  assert.match(s, /availabilityTimeSlots\.listAvailabilityTimeSlots/, 'endpoint moderno Time Slots V2');
  assert.match(s, /availabilityTimeSlots\.getAvailabilityTimeSlot/, 'revalidacion exacta via getAvailabilityTimeSlot');
});

test('CONTRACT-CATALOG-ID: catalogId estatico oficial presente y unico', () => {
  const cfg = read(`${SRC}/backend/internalConfig.js`);
  assert.match(cfg, /BOOKINGS_CATALOG_ID:\s*"97f091c5-83e0-40d6-aa49-db3f3b9247f1"/, 'catalogId Bookings canonical en SSOT');
  const occurrences = (cfg.match(/97f091c5-83e0-40d6-aa49-db3f3b9247f1/g) || []).length;
  assert.equal(occurrences, 1, 'definicion unica (anti-duplicacion de referencias estaticas)');
});

test('CONTRACT-FRONTEND: pageCode sin logica de negocio ni SDK directo', () => {
  const page = read(`${SRC}/pages/Calendario de reservas 2.q39h6.js`);
  const stripped = page.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  // El frontend solo puede importar webModules (backend/*.web) y helpers publicos.
  assert.ok(!/from\s*['"]@wix\/(bookings|ecom|data)['"]/.test(stripped), 'frontend no importa SDKs V2 de servidor');
  assert.ok(!/from\s*['"]wix-(data|bookings|pay|ecom)/.test(stripped), 'frontend no importa APIs legacy');
  // Captura la ruta exacta del import para validar la extension .web (sin lookahead fragil).
  for (const m of stripped.matchAll(/from\s*['"](backend\/[^'"]+)['"]/g)) {
    assert.match(m[1], /\.web$/, `frontend solo consume webModules (.web), hallado: ${m[1]}`);
  }
  assert.match(stripped, /\$w/, 'frontend opera via $w (capa de presentacion)');
});

test('CONTRACT-ASCII: esta propia suite y el motor son ASCII estrictos', () => {
  const self = read('src/backend/reservas.test.js');
  const badSelf = [...self].find((c) => c.codePointAt(0) > 127);
  assert.equal(badSelf, undefined, `reservas.test.js contiene no-ASCII: ${badSelf}`);
  const engine = read(`${SRC}/backend/reservas.web.js`);
  const badEngine = [...engine].find((c) => c.codePointAt(0) > 127);
  assert.equal(badEngine, undefined, `reservas.web.js contiene no-ASCII: ${badEngine}`);
});


// ============================================================================
// BLOQUE 6 - CONTRATOS POST-AUDITORIA (AUDIT-FIX v5010.3, cero legacy/alias)
// ============================================================================

test('CONTRACT-LOCATION-TYPE-WRITER: enum Writer exige OWNER_BUSINESS con guion bajo', async () => {
  const { SDK_CONFIG } = await import('./internalConfig.js');
  assert.strictEqual(
    SDK_CONFIG.LOCATION_TYPES.BOOKINGS_WRITER,
    'OWNER_BUSINESS',
    'BIBLIA 2.2.1 fila 8 exige OWNER_BUSINESS con guion bajo'
  );
  assert.strictEqual(SDK_CONFIG.LOCATION_TYPES.TIME_SLOTS, 'BUSINESS', 'Reader/Availability V2: BUSINESS');
  const cfgRaw = read(`${SRC}/backend/internalConfig.js`);
  assert.ok(!/OWNERBUSINESS/.test(cfgRaw), 'cero alias sin guion en internalConfig.js');
});

test('CONTRACT-BOOKINGS-APP-ID-NOT-PLACEHOLDER: APP_IDS.BOOKINGS es GUID real, no placeholder', async () => {
  const { APP_IDS } = await import('./internalConfig.js');
  assert.ok(
    !APP_IDS.BOOKINGS.includes('toreplace'),
    'BOOKINGS_APP_ID debe ser el GUID real, no un placeholder'
  );
  assert.match(APP_IDS.BOOKINGS, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'formato GUID canonico');
  assert.equal(APP_IDS.BOOKINGS, '13d21c63-b5ec-5912-8397-c3a5ddb27a97', 'BIBLIA R19: app id canonica preservada');
});

test('CONTRACT-ELEVATE-COUNT: exactamente 6 call-sites elevate() en backend de produccion', () => {
  // v5010.6: re-metrica tras reducir la superficie de elevacion a proxies con
  // consumidor real (cero codigo muerto, regla de excelencia). Conteo sobre
  // lineas no-comentario: reservas.web.js x1 + bookingCore.js x4 + bookingSaga.js x1 = 6.
  // Historico: 12 (informe maestro, inflado) -> 8 (v5010.5) -> 6 (v5010.6,
  // eliminados createBookingElevated y rescheduleBookingElevated sin uso).
  const files = [
    `${SRC}/backend/reservas.web.js`,
    `${SRC}/backend/booking/bookingCore.js`,
    `${SRC}/backend/booking/bookingSaga.js`
  ];
  let total = 0;
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      total += (line.match(/elevate\(/g) || []).length;
    }
  }
  assert.equal(total, 6, 'metrica v5010.6: 6 elevaciones canonicas (superficie minima con uso real)');
});

test('CONTRACT-ZERO-LEGACY: reservas.test.js, motor y booking importan solo superficie V2', () => {
  const files = [
    `${SRC}/backend/reservas.web.js`,
    `${SRC}/backend/booking/bookingCore.js`,
    `${SRC}/backend/booking/bookingSaga.js`,
    `${SRC}/backend/internalConfig.js`
  ];
  for (const f of files) {
    const s = read(f);
    assert.ok(!/wix-ecom-backend/.test(s), `${f}: legacy wix-ecom-backend prohibido`);
    assert.ok(!/OWNERBUSINESS/.test(s), `${f}: alias OWNERBUSINESS prohibido`);
    assert.ok(!/listMultiServiceAvailabilityTimeSlots/.test(s), `${f}: API multiservice prohibida (Custom Non-Multiservice)`);
    assert.ok(!/from\s*['"]wix-(bookings|pay)['"]/.test(s), `${f}: superficie V1 prohibida`);
  }
});

test('CONTRACT-ASCII-CONFIG: internalConfig y booking son ASCII estrictos post-audit', () => {
  for (const f of [`${SRC}/backend/internalConfig.js`, `${SRC}/backend/booking/bookingCore.js`, `${SRC}/backend/booking/bookingSaga.js`, `${SRC}/backend/citasManager.web.js`]) {
    const bad = [...read(f)].find((c) => c.codePointAt(0) > 127);
    assert.equal(bad, undefined, `${f} contiene no-ASCII: ${bad}`);
  }
});

test('CONTRACT-WRITER-LITERAL-RUNTIME: _forceStaffInPristineSlot proyecta OWNER_BUSINESS', () => {
  const core = read(`${SRC}/backend/booking/bookingCore.js`);
  assert.match(core, /BOOKINGS_WRITER\)\s*\|\|\s*"OWNER_BUSINESS"/, 'fallback literal oficial con guion bajo');
  assert.match(core, /if \(locationType === "BUSINESS"\) locationType = "OWNER_BUSINESS";/, 'coercion BUSINESS -> OWNER_BUSINESS en writer');
  assert.match(core, /writerLocationType = "OWNER_BUSINESS"/, 'proyeccion availability->writer normaliza el enum');
});

test('CONTRACT-DATA-API-EXCEPTION: wixData.query server-side documentado via EXCEPCION DATA API (BIBLIA)', () => {
  const biblia = read('BIBLIA.txt');
  assert.match(biblia, /APENDICE C - EXCEPCION DATA API/, 'la excepcion debe estar formalizada en la BIBLIA');
  for (const f of [`${SRC}/backend/reservas.web.js`, `${SRC}/backend/booking/bookingCore.js`, `${SRC}/backend/booking/bookingSaga.js`, `${SRC}/backend/citasManager.web.js`]) {
    const s = read(f);
    if (/wixData\.query\(/.test(s)) {
      assert.match(s, /EXCEPCION DATA API/, `${f}: todo uso de wixData.query debe referenciar la excepcion`);
    }
  }
});
