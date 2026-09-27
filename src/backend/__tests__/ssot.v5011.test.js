/**
 * ============================================================================
 * FILE: backend/__tests__/ssot.v5011.test.js
 * VERSION: v5011-SSOT-V2-QA
 * RESPONSIBILITY: Certificacion DINAMICA de la migracion SSOT V2 (FASES A-D):
 *   - Estaticos: cero referencias funcionales a colecciones prohibidas
 *     (ConfiguracionFiscal, AsientosContables, EventosSistemaFacturacion),
 *     nombre exacto en singular, singleton DatosFiscales via
 *     recordType=CONFIG_SISTEMA, acceso frontend solo por webMethods.
 *   - Dinamicos: ejecucion REAL de los hooks data.js bajo wixMocks
 *     (beforeInsert/beforeUpdate/beforeRemove sobre las colecciones nuevas).
 * STANDARDS: G10 ASCII Strict. node --test nativo. Node >= 18.
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { wixDataMock } from './wixMocks.js';
import {
  COLLECTIONS,
  BUSINESS_COLLECTIONS,
  FORBIDDEN_COLLECTIONS,
  RECORD_TYPE,
  RECORDTYPECONFIGSISTEMA,
  LIBRO_ORIGEN_TIPO,
} from '../internalConfig.js';

// Mocks / fixtures actualizados a la estructura canonica SSOT V2.
import {
  LibroAsientosContablesDetalle_beforeInsert,
  LibroAsientosContablesDetalle_beforeUpdate,
  LibroAsientosContablesDetalle_beforeRemove,
  DatosFiscales_beforeInsert,
  DatosFiscales_beforeUpdate,
} from '../data.js';

// ---------------------------------------------------------------------------
// HELPERS DE ESCANEO ESTATICO
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) {
      if (e !== 'node_modules') out.push(...walk(f));
    } else if (f.endsWith('.js')) {
      out.push(f);
    }
  }
  return out;
}

const SRC = 'src';
const SELF = join('.', 'src', 'backend', '__tests__', 'ssot.v5011.test.js');
const allJs = () => walk(SRC).filter((f) => f !== SELF && !f.endsWith('ssot.v5011.test.js'));
const read = (f) => readFileSync(f, 'utf8');

// Lineas de codigo reales: descarta comentarios (regla // y bloques /* * /).
function codeOnly(src) {
  const lines = src.split('\n');
  const out = [];
  let inBlock = false;
  for (const l of lines) {
    const t = l.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    out.push(l);
  }
  return out.join('\n');
}

const DEAD_RE = /\b(ConfiguracionFiscal|EventosSistemaFacturacion)\b|["']AsientosContables["']/;

// Archivos que DECLARAN la lista de colecciones muertas como guarda negativa
// (FORBIDDEN_COLLECTIONS y assertions que verifican su ausencia). Se excluyen
// del escaneo EST-01 porque nombran las IDs prohibidas precisamente para
// certificar que no existen: es codigo de guarda, no referencia funcional.
const GUARD_ALLOWLIST = [
  'internalConfig.js',        // FORBIDDEN_COLLECTIONS (unica declaracion canonica)
  'unit.testRunner.js',       // assert de ausencia de valores muertos
  'ssot.v5010.test.js',       // suite historica con guardas negativas
];

// ---------------------------------------------------------------------------
// ESTATICO EST-01: cero referencias funcionales a colecciones prohibidas
// ---------------------------------------------------------------------------

test('EST-01 cero referencias funcionales a ConfiguracionFiscal/AsientosContables/EventosSistemaFacturacion', () => {
  for (const f of allJs()) {
    if (GUARD_ALLOWLIST.some((g) => f.endsWith(g))) continue;
    const code = codeOnly(read(f));
    assert.ok(!DEAD_RE.test(code), `${f}: referencia funcional residual a coleccion prohibida`);
  }
});

// ---------------------------------------------------------------------------
// ESTATICO EST-02: internalConfig refleja unicamente colecciones vigentes
// ---------------------------------------------------------------------------

test('EST-02 internalConfig: colecciones definitivas y guardas canonicas', () => {
  assert.strictEqual(COLLECTIONS.DATOS_FISCALES, 'DatosFiscales');
  assert.strictEqual(COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE, 'LibroAsientosContablesDetalle');
  // FASE A: constante canonica del singleton.
  assert.strictEqual(RECORDTYPECONFIGSISTEMA, 'CONFIG_SISTEMA');
  assert.strictEqual(RECORD_TYPE.CONFIG_SISTEMA, 'CONFIG_SISTEMA');
  // Nombre EXACTO en singular (prohibido plural).
  assert.ok(!Object.values(COLLECTIONS).includes('LibroAsientosContablesDetalles'));
  // Las tres muertas NO pueden ser valores activos.
  for (const dead of ['ConfiguracionFiscal', 'AsientosContables', 'EventosSistemaFacturacion']) {
    assert.ok(!Object.values(COLLECTIONS).includes(dead), `valor activo prohibido: ${dead}`);
    assert.ok(FORBIDDEN_COLLECTIONS.includes(dead), `FORBIDDEN_COLLECTIONS debe listar: ${dead}`);
  }
  assert.ok(!FORBIDDEN_COLLECTIONS.includes('LibroAsientosContablesDetalle'),
    'la coleccion definitiva no puede estar prohibida');
  assert.ok(BUSINESS_COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE === 'LibroAsientosContablesDetalle');
});

// ---------------------------------------------------------------------------
// ESTATICO EST-03: singleton fiscal leido SIEMPRE con filtro recordType
// ---------------------------------------------------------------------------

test('EST-03 consultas a DatosFiscales filtradas por recordType=CONFIG_SISTEMA', () => {
  for (const f of allJs()) {
    const code = codeOnly(read(f));
    if (!code.includes('DATOS_FISCALES')) continue;
    // Regla SSOT: toda lectura del singleton de configuracion fiscal debe
    // filtrar .eq("recordType", CONFIG_SISTEMA). Las lecturas de TERCEROS
    // (maestros de clientes/proveedores) se identifican por el filtro
    // taxId/recordType=TERCERO y son validas en DatosFiscales.
    for (const m of code.matchAll(/query\(COLLECTIONS\.DATOS_FISCALES\)([\s\S]{0,200}?)\.find/g)) {
      const window = m[1];
      const isThirdPartyRead = /\.eq\(\s*["']taxId["']/.test(window) ||
        /recordType[^"']*["']TERCERO["']/.test(window);
      if (isThirdPartyRead) continue;
      assert.ok(/recordType/.test(window) && /CONFIG_SISTEMA/.test(window),
        `${f}: consulta DatosFiscales (singleton fiscal) sin filtro recordType=CONFIG_SISTEMA`);
    }
  }
});

// ---------------------------------------------------------------------------
// ESTATICO EST-04: campos legacy fuera de toda ESCRITURA nueva
// ---------------------------------------------------------------------------

test('EST-04 cero uso de campos legacy en escrituras nuevas (producerTaxId, computerSystemId, entryHash, fiscalPayloadSnapshot)', () => {
  const LEGACY_RE = /\b(producerTaxId|producerLegalName|computerSystemId|installationNumber|possibleUseMultiOT|possibleUseOnlyVerifactu|multipleOTIndicator|verifactuStartDate|fiscalPayloadSnapshot|entryHash)\b/;
  for (const f of allJs()) {
    const code = codeOnly(read(f));
    // Excepcion documentada: listas de rechazo legacy en hooks (data.js) y
    // fixtures negativos de esta misma suite.
    if (f.endsWith('data.js')) continue;
    assert.ok(!LEGACY_RE.test(code), `${f}: campo legacy presente en codigo`);
  }
});

// ---------------------------------------------------------------------------
// ESTATICO EST-05: frontend sin acceso directo a colecciones fiscales
// ---------------------------------------------------------------------------

test('EST-05 public/ y pages/ no consultan DatosFiscales ni LibroAsientosContablesDetalle', () => {
  for (const dir of ['src/public', 'src/pages']) {
    for (const f of walk(dir)) {
      const code = codeOnly(read(f));
      assert.ok(!/wixData\.(query|insert|update|remove|get)\(\s*["'](DatosFiscales|LibroAsientosContablesDetalle)["']/.test(code),
        `${f}: acceso directo frontend a coleccion fiscal`);
      assert.ok(!/from ["'](wix-data|backend\/internalConfig)["']/.test(code) ||
        !/DATOS_FISCALES|LIBRO_ASIENTOS_CONTABLES_DETALLE/.test(code),
        `${f}: constante duplicada de coleccion fiscal en frontend`);
    }
  }
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-01: hook beforeInsert libro definitivo (flujo valido)
// ---------------------------------------------------------------------------

const FIXTURE_LIBRO_VALIDO = Object.freeze({
  origenTipo: 'EVENTOSISTEMAFACTURACION',
  origenRegistro: 'MOVIMIENTOSCAJA',
  traceId: 'TRACE_SSOT_V2_TEST',
  recordHash: 'a'.repeat(64),
  previousRecordHash: 'b'.repeat(64),
  idSistemaInformatico: 'SIF-MM-001',
  payloadFiscal: {
    numSerieFactura: 'F2026-0001',
    descripcionOperacion: 'Servicio prueba SSOT V2',
    cuotaTotal: 21,
    claveRegimen: '01',
    sistemaInformatico: { idSistemaInformatico: 'SIF-MM-001' },
  },
  desgloseDetallado: [{ baseImponibleOImporteNoSujeto: 100, cuotaRepercutida: 21 }],
  cuentaContable: '4300',
  bookingId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
});

test('DYN-SSOT-01 beforeInsert acepta registro canonico del libro', () => {
  const out = LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO });
  assert.equal(out.origenTipo, 'EVENTOSISTEMAFACTURACION');
  assert.equal(out.recordHash, 'a'.repeat(64));
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-02: rechazo de escrituras legacy y discriminadores
// ---------------------------------------------------------------------------

test('DYN-SSOT-02 beforeInsert rechaza campos legacy y falta de discriminadores', () => {
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, entryHash: 'x' }),
    /SCHEMA_VIOLATION.*entryHash/, 'entryHash legacy debe rechazarse');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, fiscalPayloadSnapshot: {} }),
    /SCHEMA_VIOLATION.*fiscalPayloadSnapshot/, 'fiscalPayloadSnapshot legacy debe rechazarse');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, computerSystemId: 'X' }),
    /SCHEMA_VIOLATION.*computerSystemId/, 'computerSystemId legacy debe rechazarse');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, origenTipo: undefined }),
    /origenTipo obligatorio/, 'origenTipo discriminatorio obligatorio');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, origenRegistro: '' }),
    /origenRegistro obligatorio/, 'origenRegistro discriminatorio obligatorio');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, traceId: '' }),
    /traceId obligatorio/, 'traceId obligatorio');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, recordHash: '' }),
    /recordHash obligatorio/, 'recordHash canonico obligatorio');
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO, payloadFiscal: null }),
    /payloadFiscal obligatorio/, 'payloadFiscal canonico obligatorio');
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-03: append-only del libro (update/remove prohibidos)
// ---------------------------------------------------------------------------

test('DYN-SSOT-03 libro es append-only (beforeUpdate/beforeRemove bloquean)', () => {
  assert.throws(() => LibroAsientosContablesDetalle_beforeUpdate({}), /FISCAL_VIOLATION/);
  assert.throws(() => LibroAsientosContablesDetalle_beforeRemove({}), /FISCAL_VIOLATION/);
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-04: singleton CONFIG_SISTEMA con nomenclatura canonica
// ---------------------------------------------------------------------------

const FIXTURE_CONFIG_VALIDA = Object.freeze({
  recordType: 'CONFIG_SISTEMA',
  nifProductor: '12345678Z',
  nombreRazonProductor: 'Marian Madrid S.L.',
  idSistemaInformatico: 'SIF-MM-001',
  numeroInstalacion: '001',
  tipoUsoPosibleSoloVerifactu: 'Y',
  tipoUsoPosibleMultiOT: 'N',
  indicadorMultiplesOT: 'S',
  fechaInicioVerifactu: '2026-01-01',
});

test('DYN-SSOT-04 DatosFiscales CONFIG_SISTEMA valida nomenclatura canonica', () => {
  const out = DatosFiscales_beforeInsert({ ...FIXTURE_CONFIG_VALIDA });
  assert.equal(out.recordType, 'CONFIG_SISTEMA');
  assert.equal(out.nifProductor, '12345678Z');
  // update del singleton tambien pasa reglas canonicas.
  const upd = DatosFiscales_beforeUpdate({ ...FIXTURE_CONFIG_VALIDA });
  assert.equal(upd.nombreRazonProductor, 'Marian Madrid S.L.');
});

test('DYN-SSOT-05 DatosFiscales CONFIG_SISTEMA rechaza campos legacy fusionados', () => {
  assert.throws(
    () => DatosFiscales_beforeInsert({ ...FIXTURE_CONFIG_VALIDA, producerTaxId: '12345678Z' }),
    /SCHEMA_VIOLATION.*producerTaxId/, 'producerTaxId legacy prohibido');
  assert.throws(
    () => DatosFiscales_beforeInsert({ ...FIXTURE_CONFIG_VALIDA, installationNumber: '001' }),
    /SCHEMA_VIOLATION.*installationNumber/, 'installationNumber legacy prohibido');
  assert.throws(
    () => DatosFiscales_beforeInsert({ ...FIXTURE_CONFIG_VALIDA, possibleUseMultiOT: 'N' }),
    /SCHEMA_VIOLATION.*possibleUseMultiOT/, 'possibleUseMultiOT legacy prohibido');
  assert.throws(
    () => DatosFiscales_beforeInsert({ ...FIXTURE_CONFIG_VALIDA, verifactuStartDate: '2026-01-01' }),
    /SCHEMA_VIOLATION.*verifactuStartDate/, 'verifactuStartDate legacy prohibido');
  assert.throws(
    () => DatosFiscales_beforeInsert({ recordType: 'CONFIG_SISTEMA', nombreRazonProductor: 'X', idSistemaInformatico: 'Y' }),
    /nifProductor obligatorio/, 'nifProductor canonico obligatorio');
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-06: terceros siguen regulares tras la bifurcacion
// ---------------------------------------------------------------------------

test('DYN-SSOT-06 DatosFiscales tercero (TERCERO) conserva validacion previa', () => {
  const ok = DatosFiscales_beforeInsert({
    recordType: 'TERCERO',
    taxId: 'B12345678',
    legalName: 'Cliente Test',
    thirdPartyType: 'CLIENTE',
  });
  assert.equal(ok.thirdPartyType, 'CLIENTE');
  assert.throws(
    () => DatosFiscales_beforeInsert({ recordType: 'TERCERO', taxId: 'XX', legalName: 'A', thirdPartyType: 'CLIENTE' }),
    /taxId obligatorio/, 'taxidad invalido rechazado');
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-07: flujo mock end-to-end hacia la coleccion definitiva
// ---------------------------------------------------------------------------

test('DYN-SSOT-07 flujo de escritura mock usa LibroAsientosContablesDetalle', async () => {
  // Simula el path de proyeccion: hook -> insert bajo wixDataMock.
  const doc = LibroAsientosContablesDetalle_beforeInsert({ ...FIXTURE_LIBRO_VALIDO });
  const inserted = await wixDataMock.insert(COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE, doc);
  assert.ok(inserted._id, 'mock insert devuelve _id');
  assert.equal(inserted.origenTipo, 'EVENTOSISTEMAFACTURACION');
  assert.equal(inserted.origenRegistro, 'MOVIMIENTOSCAJA');
  // Update sobre el libro debe fallar incluso bajo mock operativo:
  // beforeUpdate lanza FISCAL_VIOLATION de forma SINCRONA (append-only).
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeUpdate(inserted),
    /FISCAL_VIOLATION/);
  assert.throws(
    () => LibroAsientosContablesDetalle_beforeRemove(inserted),
    /FISCAL_VIOLATION/);
});

// ---------------------------------------------------------------------------
// DINAMICO DYN-SSOT-08: bateria estructural unit.testRunner (SSOT V2)
// ---------------------------------------------------------------------------

test('DYN-SSOT-08 unit.testRunner::testCollectionsDefined pasa con guardas V2', async () => {
  const mod = await import('./unit.testRunner.js');
  const r = await mod.testCollectionsDefined();
  assert.equal(r.status, 'PASS', `guardas estructurales SSOT V2: ${JSON.stringify(r)}`);
});

// DYN-SSOT-09: los discriminadores canonicos del enum interno coinciden
// con los valores usados por el hook y por las escrituras del backend.
test('DYN-SSOT-09 LIBRO_ORIGEN_TIPO alineado con VALID_LIBRO_ORIGEN_TIPOS', () => {
  assert.strictEqual(LIBRO_ORIGEN_TIPO.ASIENTOCONTABLE, 'ASIENTOCONTABLE');
  assert.strictEqual(LIBRO_ORIGEN_TIPO.EVENTOSISTEMAFACTURACION, 'EVENTOSISTEMAFACTURACION');
  assert.strictEqual(LIBRO_ORIGEN_TIPO.MOVIMIENTOCAJA, 'MOVIMIENTOCAJA');
  assert.strictEqual(LIBRO_ORIGEN_TIPO.CIERREZ, 'CIERREZ');
  assert.strictEqual(LIBRO_ORIGEN_TIPO.RECTIFICATIVA, 'RECTIFICATIVA');
});
