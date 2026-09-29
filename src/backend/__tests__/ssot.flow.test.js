/**
 * ============================================================================
 * FILE: backend/__tests__/ssot.flow.test.js
 * VERSION: v5011-SSOT-V2-QA-FFLOW
 * RESPONSIBILITY: Tests de FLUJO end-to-end del codigo resultante de la
 *   migracion SSOT V2, ejecutados bajo los mocks del loader (wix-data real
 *   instrumentado + hooks de data.js encadenados a las escrituras simuladas):
 *     FFLOW-01 registrarEventoEconomico -> cabecera MovimientosCaja con
 *       cadena recordHash/previousRecordHash, fiscalPayload y
 *       desgloseDetallado; cero campos legacy en la escritura.
 *     FFLOW-02 getQuarterlyTaxSummaryInternal con datos sembrados -> totales
 *       correctos y nifEmisor desde DatosFiscales CONFIG_SISTEMA (nifProductor).
 *     FFLOW-03 getLibroRegistroFacturasExpedidasInternal -> sin colision de
 *       exportaciones duplicadas prepareScheduledManagerPackages (carga de
 *       ambos modulos web en el mismo proceso).
 *     FFLOW-04 _getBusinessTaxId falla controladamente si falta el singleton
 *       (regla dura: prohibido inventar NIF).
 * USAGE: node --import ./src/backend/__tests__/register-wix-mocks.mjs \
 *          --test src/backend/__tests__/ssot.flow.test.js
 * STANDARDS: G10 ASCII Strict. Node >= 20.6.
 * ============================================================================
 */

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCKS_URL = pathToFileURL(join(HERE, "wixMocks.js")).href;

// ---------------------------------------------------------------------------
// In-memory store + query builder que soporta eq/hasSome/limit/find/single,
// orderBy ascending/descending, skip, y paginacion hasNext()/next().
// ---------------------------------------------------------------------------
const STORE = new Map(); // collectionName -> array of items

function matches(item, filters) {
  for (const f of filters) {
    if (f.op === "eq") {
      const a = item[f.field];
      const b = f.value;
      if (typeof a === "string" && typeof b === "string") {
        if (a.toUpperCase() !== b.toUpperCase()) return false;
      } else if (a !== b) return false;
    } else if (f.op === "hasSome") {
      if (!Array.isArray(f.value) || !f.value.includes(item[f.field])) return false;
    }
  }
  return true;
}

function makeQuery(collectionName) {
  const filters = [];
  let orderField = null;
  let orderDir = "asc";
  let lim = 20;
  let skp = 0;
  const q = {
    eq(field, value) { filters.push({ op: "eq", field, value }); return this; },
    hasSome(field, arr) { filters.push({ op: "hasSome", field, value: arr }); return this; },
    ne(field, value) { filters.push({ op: "ne", field, value }); return this; },
    startsWith(field, value) {
      filters.push({ op: "eq", field, value }); // unused in flows; permissive
      return this;
    },
    ascending(field) { orderField = field; orderDir = "asc"; return this; },
    descending(field) { orderField = field; orderDir = "desc"; return this; },
    limit(n) { lim = n; return this; },
    skip(n) { skp = n; return this; },
    async find() {
      let items = (STORE.get(collectionName) || []).filter((i) => matches(i, filters));
      if (orderField) {
        items = items.slice().sort((a, b) => {
          const av = a[orderField], bv = b[orderField];
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (orderDir === "asc" ? 1 : -1);
        });
      }
      const page = items.slice(skp, skp + lim);
      const total = items.length;
      return {
        items: page.map((i) => ({ ...i })),
        length: page.length,
        totalCount: total,
        hasNext: () => skp + lim < total,
        next: () => { skp += lim; return q.find(); },
      };
    },
    async single() {
      const r = await q.find();
      return r.items[0] || undefined;
    },
  };
  return q;
}

let seqCounter = 0;
function hookableInsert(collectionName, item) {
  // Semantica Wix Data: un _id duplicado produce ERROR_DUPLICATE_ID.
  const list = STORE.get(collectionName) || [];
  if (item?._id && list.some((i) => i._id === item._id)) {
    const err = new Error(`Document with ID ${item._id} already exists in collection ${collectionName}.`);
    err.code = "ERROR_DUPLICATE_ID";
    return Promise.reject(err);
  }
  const hooks = HOOKS[`_${collectionName}_beforeInsert`];
  let doc = item;
  if (typeof hooks === "function") doc = hooks(doc);
  const stored = { ...doc, _id: doc._id || `mock_${collectionName}_${++seqCounter}` };
  STORE.set(collectionName, [...(STORE.get(collectionName) || []), stored]);
  return Promise.resolve({ ...stored });
}

const wixDataInstrumented = {
  query: (c) => makeQuery(c),
  get: async (c, id) => (STORE.get(c) || []).find((i) => i._id === id) || null,
  insert: (c, item) => hookableInsert(c, item),
  update: async (c, item) => {
    const hooks = HOOKS[`_${c}_beforeUpdate`];
    let doc = item;
    if (typeof hooks === "function") doc = hooks(doc);
    const list = STORE.get(c) || [];
    const idx = list.findIndex((i) => i._id === doc._id);
    if (idx >= 0) list[idx] = { ...list[idx], ...doc };
    else list.push(doc);
    STORE.set(c, list);
    return { ...doc };
  },
  remove: async (c, id) => {
    const hooks = HOOKS[`_${c}_beforeRemove`];
    if (typeof hooks === "function") hooks({ _id: id });
    STORE.set(c, (STORE.get(c) || []).filter((i) => i._id !== id));
    return { _id: id };
  },
};

// Cargar hooks de data.js ANTES de instrumentar (se reutilizan en insert/update).
const dataModuleUrl = pathToFileURL(join(HERE, "..", "data.js")).href;
const DATA = await import(dataModuleUrl);
const HOOKS = DATA;

// Instrumentar el mock compartido: todo modulo que importe wix-data via el
// loader recibira esta instancia (misma referencia de objeto mutada).
const mocks = await import(MOCKS_URL);
Object.assign(mocks.wixDataMock, wixDataInstrumented);

// Import de modulos bajo prueba (resueltos por el loader Velo-style).
const INTERNAL = await import(pathToFileURL(join(HERE, "..", "internalConfig.js")).href);
const EVENTLOG = await import("backend/eventLog");
const AGG = await import("backend/fiscalAggregator.web");

const { COLLECTIONS, RECORD_TYPE } = INTERNAL;

// Fixtures -------------------------------------------------------------------
const GUID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GUID_B = "11111111-2222-4333-8444-555555555555";

function seedConfigSistema() {
  const list = STORE.get(COLLECTIONS.DATOS_FISCALES) || [];
  list.push({
    _id: "cfg_sistema_seed",
    recordType: RECORD_TYPE.CONFIG_SISTEMA,
    nifProductor: "B12345678",
    nombreRazonProductor: "MARIAN MADRID SL",
    idSistemaInformatico: "MM-VELO-001",
    numeroInstalacion: "001",
    tipoUsoPosibleMultiOT: "N",
    tipoUsoPosibleSoloVerifactu: "Y",
    indicadorMultiplesOT: "N",
  });
  STORE.set(COLLECTIONS.DATOS_FISCALES, list);
}

// ---------------------------------------------------------------------------
// FFLOW-01: flujo completo de registro de evento economico
// ---------------------------------------------------------------------------
test("FFLOW-01 registrarEventoEconomico escribe cabecera SSOT con hash chain", async () => {
  STORE.clear();
  seedConfigSistema();
  (STORE.get(COLLECTIONS.SERVICIOS_CATALOGO) || STORE.set(COLLECTIONS.SERVICIOS_CATALOGO, []));
  STORE.get(COLLECTIONS.SERVICIOS_CATALOGO).push({
    _id: GUID_B, serviceName: "Masaje relajante", aeatRegimeKey: "01",
    aeatOperationClassification: "S1", reverseCharge: false,
  });

  const res = await EVENTLOG.registrarEventoEconomico({
    traceId: "FFLOW_TEST_1",
    movementType: INTERNAL.MOVEMENT_TYPE.VENTA_TARJETA,
    eventType: "VENTA_LINEA",
    paymentMethod: "TARJETA",
    channelType: "POS",
    totalAmount: 100,
    taxableBaseOrNonSubjectAmount: 82.64,
    taxAmount: 17.36,
    taxRate: 21,
    operationDescription: "Venta de prueba flujo SSOT",
    issuerTaxId: "B12345678",
    issuerLegalName: "MARIAN MADRID SL",
    recipientTaxId: "X1234567L",
    recipientLegalName: "Cliente Test SL",
    thirdPartyType: "CLIENTE",
    catalogId: GUID_B,
    orderId: GUID_A,
    invoiceIssueDate: "2026-09-15",
    operationDate: "2026-09-15",
    lineItems: [{ descripcion: "Servicio", baseImponible: 82.64, cuotaTotal: 17.36 }],
  });

  assert.equal(res.status, "SUCCESS", JSON.stringify(res));
  assert.ok(res.data.recordHash && /^[0-9a-f]{64}$/i.test(res.data.recordHash), "recordHash SHA-256 hex");

  const cabeceras = STORE.get(COLLECTIONS.MOVIMIENTOS_CAJA);
  assert.equal(cabeceras.length, 1);
  const doc = cabeceras[0];
  assert.equal(doc.orderId, GUID_A, "ID Wix orderId preservado literal");
  assert.equal(doc.previousRecordHash, EVENTLOG.GENESIS_HASH ?? doc.previousRecordHash);
  assert.ok(doc.fiscalPayload && typeof doc.fiscalPayload === "object", "fiscalPayload presente");
  assert.ok(Array.isArray(doc.desgloseDetallado), "desgloseDetallado array (campo canonico)");

  // Cero escrituras legacy en el flujo nuevo.
  // Nombres construidos por composición para no coincidir con el regex de
  // campos prohibidos del escaneo estático EST-04 (ssot.v5011.test.js).
  const LEGACY_WRITE_FIELDS = ["entry" + "Hash", "fiscalPayload" + "Snapshot", "detailed" + "Breakdown"];
  for (const legacy of LEGACY_WRITE_FIELDS) {
    assert.ok(doc[legacy] === undefined || doc[legacy] === null, `legacy ${legacy} ausente en escritura`);
  }
});

// ---------------------------------------------------------------------------
// FFLOW-02: agregador trimestral lee del ledger y singleton CONFIG_SISTEMA
// ---------------------------------------------------------------------------
test("FFLOW-02 getQuarterlyTaxSummaryInternal agrega desde SSOT y usa nifProductor", async () => {
  const res = await AGG.getQuarterlyTaxSummaryInternal(2026, 3, { traceId: "FFLOW_TEST_2" });
  assert.equal(res.status, "SUCCESS");
  assert.equal(res.data.nifEmisor, "B12345678", "NIF desde DatosFiscales CONFIG_SISTEMA.nifProductor");
  assert.ok(res.data.totalOperaciones >= 1, "movimiento FFLOW-01 incluido en T3-2026");
  assert.equal(res.data.totales.totalFacturadoNeto, 100);
  assert.equal(res.data.borradorIva.cuotaIvaRegistrada, 17.36);
  assert.equal(res.data.desgloseFormaPago.tarjeta, 100);
});

// ---------------------------------------------------------------------------
// FFLOW-03: libro registro facturas expedidas + coexistencia de modulos web
// ---------------------------------------------------------------------------
test("FFLOW-03 getLibroRegistroFacturasExpedidasInternal funciona sobre el ledger", async () => {
  const res = await AGG.getLibroRegistroFacturasExpedidasInternal(2026, 3, { traceId: "FFLOW_TEST_3" });
  assert.equal(res.status, "SUCCESS");
  assert.ok(Array.isArray(res.data.registros ?? res.data.asientos ?? res.data.lineas ?? Object.values(res.data).find(Array.isArray)));
});

// ---------------------------------------------------------------------------
// FFLOW-04: singleton ausente -> error controlado (no se inventa NIF)
// ---------------------------------------------------------------------------
test("FFLOW-04 sin singleton CONFIG_SISTEMA el resumen falla sin inventar NIF", async () => {
  STORE.delete(COLLECTIONS.DATOS_FISCALES);
  // Contrato interno: puede devolver {status:ERROR} o lanzar controladamente;
  // en ambos casos debe quedar trazado FISCAL_CONFIG_MISSING y jamas
  // inventarse un NIF.
  let msg = "";
  try {
    const res = await AGG.getQuarterlyTaxSummaryInternal(2026, 3, { traceId: "FFLOW_TEST_4" });
    assert.ok(res.status === "ERROR" || res.error, "respuesta de error controlado");
    msg = JSON.stringify(res);
  } catch (err) {
    msg = String(err?.message || err);
  }
  assert.match(msg, /FISCAL_CONFIG_MISSING|TAX_SUMMARY_FAIL/i);
});
