/* One-shot deterministic rebuild of bookingCore.js as facade. Not part of src/. */
import fs from 'node:fs';

const SRC = 'src/backend/booking/bookingCore.js';
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

function find(pred, msg) {
  const i = lines.findIndex(pred);
  if (i < 0) throw new Error('anchor not found: ' + msg);
  return i;
}
const seg = (a, b) => lines.slice(a, b); // [a,b)

const iHdrEnd   = find(l => l.strip === undefined && l.trim() === '*/', 'header end');
const b2s       = find(l => l.startsWith('// BLOQUE 2 - ELEVATED PROXIES'), 'b2') - 1;
const b5s       = find(l => l.startsWith('// BLOQUE 5 - RESOLUCION DE SCHEDULEID'), 'b5') - 1;
const iAddonDoc = find(l => l.includes('CORE-02: Extraccion tolerante de addons'), 'addon doc') - 1; // sep line of /**? use the '/**' before
const iAddonsFn = find(l => l.startsWith('function _extractAddonIdsFromSlot'), 'addons fn');
const iForce    = find(l => l.startsWith('export async function _forceStaffInPristineSlot'), 'force');
const b7s       = find(l => l.startsWith('// BLOQUE 7 - CHECKOUT URL HELPER'), 'b7') - 1;
const b9s       = find(l => l.startsWith('// BLOQUE 9 - SLOT KEYS'), 'b9') - 1;
const b10s      = find(l => l.startsWith('// BLOQUE 10 - TRANSACCIONES'), 'b10') - 1;
const b15s      = find(l => l.startsWith('// BLOQUE 15 - EXTRACCION DE RESOURCEIDS'), 'b15') - 1;
const b17s      = find(l => l.startsWith('// BLOQUE 17 - VERIFICACION DE CONTIGUIDAD'), 'b17') - 1;
const b20s      = find(l => l.startsWith('// BLOQUE 20 - PAIR TOKEN'), 'b20') - 1;
const b21s      = find(l => l.startsWith('// BLOQUE 21 - RANKING'), 'b21') - 1;
const iElev     = find(l => l.startsWith('// v5010.6: superficie reducida'), 'elev comment');
const iCancel   = find(l => l.startsWith('export const cancelBookingElevated'), 'cancel');
const iBkCompat = find(l => l.includes('Back-compat: some modules historically imported logger'), 'bkcompat');
const iErrCls   = find(l => l.startsWith('export class BookingError'), 'errclass');
const iExportLog= find(l => l === 'export { logger };', 'exportlog');

// ---------- new imports + reexports block ----------
const IMPORTS = `
import { bookings } from "@wix/bookings";
// AUDIT-FIX v5010.3 (TAREA 4): import ecom migrado al SDK unificado V2
// "@wix/ecom" (cero legacy). Firmas equivalentes:
// checkout.createCheckout(request) y checkout.getCheckoutUrl(id, opts).
import { checkout } from "@wix/ecom";
import { elevate } from "wix-auth";
// EXCEPCION DATA API (APENDICE C de la BIBLIA): lectura/escritura CMS
// server-side via wixData con suppressAuth; ver apendice para el porque
// no se migra a datasets.query('@wix/data').queryDataItems().
import wixData from "wix-data";
import { getStaffScheduleId } from "backend/staff";
import { logger } from "backend/logger";

// v5010.7 (FASE 3 / CORE-08): el mutex SlotLocks vive en core/locks.js.
// bookingCore es FACHADA: reexporta la superficie historica sin duplicar
// logica ni cambiar contratos. Nadie importa core/locks.js directamente.
import {
    _safeLockId,
    _getLock,
    _getLockOwnerId,
    _isDuplicateItemError,
    _buildLockDocument,
    _lockSlotKeyOrFail,
    _unlockSlotKey,
    _renewLock,
} from "backend/booking/core/locks";

// v5010.7 (FASE 3 / CORE-09, CORE-10): errores, constantes de dominio,
// resolucion de scheduleId, transacciones, persistencia, validacion/
// proyeccion y ranking viven en backend/booking/core/*. Cada extraccion
// es 1:1 sin cambio de logica: bookingCore permanece como FACHADA
// estable para saga/web/crons/tests.
import {
    ERROR_CODES,
    BookingError,
    createBookingError,
    normalizeError,
    _handleError,
} from "backend/booking/core/errors";
import {
    STAFF_RESOURCE_TYPE_ID,
    CONFIGURED_LOCATION_ID,
} from "backend/booking/core/config";
import { _resolveScheduleIdForResource } from "backend/booking/core/scheduleResolver";
import {
    _initTransaction,
    _completeTransaction,
    _failTransaction,
} from "backend/booking/core/transactions";
import {
    _persistBooking,
    _updateCitaSafe,
} from "backend/booking/core/persistence";
import {
    _areSlotsContiguous,
    _projectCertifiedSlot,
    _projectWriterSlotFromAvailability,
    _extractAddonIdsFromSlot,
} from "backend/booking/core/validation";
import { _rankResourcesByLoad } from "backend/booking/core/loadRanking";

import {
    COLLECTIONS,
    CONCURRENCY,
    SDK_CONFIG,
    SLOT_SEARCH,
    API,
    PAYMENT_STATUS,
    INACTIVE_BOOKING_STATUSES,
} from "backend/internalConfig";
import {
    _safeTrim,
    _looksLikeGuid,
    getUtcDateFromMadridLocal,
    getMadridLocalStringNoZ,
    makeTraceId,
    _toDateSafe,
    _hashKey,
    _normalizeLocalIsoStr,
} from "public/mmUtils";
import {
    computeGapMinutes,
    getResourceIdsFromSlot,
    // v5010.4 (FASE 2): huella canonica definida en bookingUtils (capa de
    // utilidades puras, segun precedencia mmUtils > bookingUtils > core > web).
    // Evita el ciclo bookingUtils -> bookingCore que se habia introducido.
    _buildPairFingerprint,
} from "backend/booking/bookingUtils";

const log = logger;

// FIX-32 / CORE-04 / CORE-07: constantes de dominio definidas en
// core/config.js y REEXPORTADAS por la fachada (contrato historico).
export { STAFF_RESOURCE_TYPE_ID, CONFIGURED_LOCATION_ID };

// v5010.4 (FASE 2): unica definicion de la huella en bookingUtils; aqui solo
// se REEXPORTA la superficie publica historica (sin duplicar logica) y se
// define el token determinista canonico sobre esa huella (CORE-05).
export { _buildPairFingerprint };

// v5010.7 (CORE-08): reexport de la fachada (contrato publico historico).
export {
    _safeLockId,
    _lockSlotKeyOrFail,
    _unlockSlotKey,
    _renewLock,
};

// v5010.7 (FASE 3 / CORE-09, CORE-10): reexports tras la extraccion a
// core/*. El contrato publico de bookingCore NO cambia para nadie.
export {
    ERROR_CODES,
    BookingError,
    createBookingError,
    normalizeError,
    _handleError,
};
export { _resolveScheduleIdForResource };
export { _initTransaction, _completeTransaction, _failTransaction };
export { _persistBooking, _updateCitaSafe };
export { _areSlotsContiguous, _projectCertifiedSlot, _projectWriterSlotFromAvailability };
export { _rankResourcesByLoad };
`.split('\n');

// ---------- private schedule resolver (only for _forceStaffInPristineSlot) ----------
const RES_PRIV = `
// =============================================================================
// BLOQUE 5 - RESOLUCION DE SCHEDULEID (fallback privado del writer)
// =============================================================================
// v5010.7 (CORE-09): la superficie publica _resolveScheduleIdForResource vive
// ahora en core/scheduleResolver.js (reexportada arriba). Este helper privado
// alimenta exclusivamente a _forceStaffInPristineSlot (BLOQUE 6).

async function _resolveScheduleIdByResourceId(resourceId) {
    const id = _safeTrim(resourceId);
    if (!id || !_looksLikeGuid(id)) return null;
    const scheduleId = await getStaffScheduleId(id);
    return scheduleId && _looksLikeGuid(scheduleId) ? scheduleId : null;
}
`.split('\n');

// ---------- BLOQUE 15 delegator ----------
const DELEG15 = `
// =============================================================================
// BLOQUE 15 - EXTRACCION DE RESOURCEIDS DESDE SLOTS (CORE-01)
// =============================================================================

/**
 * CORE-01: Paridad 1:1 con reservas.web._getResourceIdsFromSlot.
 * Delegacion total en bookingUtils.getResourceIdsFromSlot (unica
 * implementacion; reservas.web importa el mismo helper).
 */
export function _extractResourceIdsFromSlot(slot) {
    return getResourceIdsFromSlot(slot, STAFF_RESOURCE_TYPE_ID);
}
`.split('\n');

// ---------- assemble ----------
const out = [];
out.push(...seg(0, iHdrEnd + 1));                       // module header comment
out.push(...IMPORTS);
out.push(...seg(b2s, iCancel));                          // BLOQUE 2 header+comment, up to proxies
out.push(...seg(iCancel, iBkCompat));                    // proxies + payment map + wrapper hasta back-compat
out.push(...seg(iBkCompat, iExportLog + 1));             // back-compat logger export
out.push([]);
out.push(...RES_PRIV);                                   // bloque 5 privado
out.push([]);
out.push(...seg(iAddonDoc, iAddonsFn));                  // skip: nothing (we drop addon copy) -> handled below
out.pop(); out.pop();                                    // remove the two pushes above (keep clean)
out.length -= 1;                                         // drop blank
// BLOQUE 6 header lives between b5 and addon doc in original; take from '// BLOQUE 6' sep
const b6s = find(l => l.startsWith('// BLOQUE 6 - NORMALIZACION DE SLOTS'), 'b6') - 1;
out.push(...seg(b6s, iAddonsFn));                        // bloque 6 header + doc intro
out.push(`// v5010.7 (CORE-10): _extractAddonIdsFromSlot vive ahora en`,
         `// core/validation.js (unica implementacion); importada arriba y`,
         `// usada por _forceStaffInPristineSlot sin duplicar logica.`, ``);
out.push(...seg(iForce, b10s));                          // force + bloques 7 y 9 (hasta BLOQUE 10)
out.push(...DELEG15);                                     // bloque 15 delegador
out.push([]);
out.push(...seg(b17s, b21s));                             // bloques 17,18,20 (contiguidad/proyeccion/token)
out.push('');                                             // EOF

// Drop duplicated bloque 17/18 content that came inside seg(iForce,b10s)? No: those were after b10..; verify ranges:
fs.writeFileSync(SRC, out.join('\n'));
console.log('rebuilt', SRC, 'lines=', out.length);
