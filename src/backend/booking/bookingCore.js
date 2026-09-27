/*
MODULE: backend/booking/bookingCore.js
VERSION: v5009-FISCAL-V20.2-CORE
BASE: v5009-FISCAL-V20.1 + Alineacion con bookingSaga v5009-FISCAL-V20.3
RESPONSIBILITY: Capa de acceso y primitivas atomicas para reservas.
STANDARDS: ASCII only. No Node builtins.

FIXES APLICADOS v5009-FISCAL-V20.2:
  - CORE-01: _extractResourceIdsFromSlot acepta resourceTypeId,
             resourceType.id, resourceType._id y typeId. Paridad 1:1 con
             reservas.web._getResourceIdsFromSlot. Extrae tambien
             resource.resourceId. Sin este fix, _projectCertifiedSlot
             devolvia availableResources: [] con la variante anidada de Wix.
  - CORE-02: _forceStaffInPristineSlot PRESERVA addOnIds / selectedAddOns
             en el slot final. Antes los addons detectados por bookingSaga
             se perdia antes de createBooking (precio/duracion incorrectos).
  - CORE-03: _projectWriterSlotFromAvailability exige scheduleId GUID
             valido (cascada projected -> slot -> slot.slot). Devuelve null
             si no hay scheduleId util, en vez de proyectar scheduleId: "".
  - CORE-04: _projectCertifiedSlot valida locationId contra
             SDK_CONFIG.LOCATION_ID. Si el slot trae otra ubicacion,
             devuelve null (fail-fast) en vez de sustituirla en silencio.
             locationId resultante debe ser GUID valido.
  - CORE-05: Huella de pairToken CANONICA compartida.
             _buildPairFingerprint + _buildPairTokenDeterministic son la
             UNICA fuente de verdad. reservas.web.js y bookingSaga.js deben
             importarlas (ver parches de consumo mas abajo). Incluye los 8
             campos exigidos: serviceId, linkedPhases, dateYMD, f1Start,
             f1End, f2Start, f2End, resourceId.
             _generatePairToken(traceId) queda SOLO como legacy no
             determinista (no usar para correlacion dual).
  - CORE-06: confirmOrDeclineBookingElevated traduce paymentStatus del
             SSOT espanol (IMPAGADO, NO_PAGADO, PAGADO...) al enum nativo
             de Wix (UNPAID, NOT_PAID, PAID...) segun BIBLIA 3.2.1.
             Resuelve el riesgo SAGA-05: la saga envia PAYMENT_STATUS.UNPAID
             ("IMPAGADO") y Wix solo acepta el enum nativo ingles.
             Valores ingleses pasan sin cambios (back-compat total).
  - CORE-07: Constantes CONCURRENCY V20 canonicas (BIBLIA 3.2.1 filas
             15-17: MS_TTL_MUTEX, MS_LATIDO, MS_TTL_MUTEX_ASIENTO).
             v5010.4 FASE 2: internalConfig ya solo expone los nombres V20;
             las cascadas de transicion legacy se eliminaron. TRANSACTION_
             POLL_BASE_MS / TRANSACTION_MAX_WAIT_MS se conservan porque la
             norma no documenta equivalente V20 (grep BIBLIA/SSOT1 vacio).
             _persistBooking y _rankResourcesByLoad toleran alias de estado
             CONFIRMADO / PENDIENTE_PAGO / CANCELADO junto a los nativos
             ingleses (esos alias son del DOMINIO Wix/CitasF2, no del SSOT).

HISTORIAL (heredado):
  v5009-FISCAL-V20.1 | Sin renombrados funcionales (esquema corto CitasF2).
  v5008.6 | 2026-09-20 | Alineacion final: FIX-32, FIX-33, FIX-43.
  v5008.5 | 2026-09-19 | COHERENCIA scheduleId: CORE-16, CORE-17.
  v5008.4 | 2026-09-19 | Date range, scheduleId obligatorio, cache validaciones.
  v5008.3 | 2026-09-19 | Restauracion de exports faltantes.
  v5008.2 | 2026-09-15 | Aligned + dead code removed.
=============================================================================
*/

import { bookings } from "@wix/bookings";
// AUDIT-FIX v5010.3 (TAREA 4): import ecom migrado al SDK unificado V2
// "@wix/ecom" (cero legacy). Firmas equivalentes:
// checkout.createCheckout(request) y checkout.getCheckoutUrl(id, opts).
import { checkout } from "@wix/ecom";
import { elevate } from "wix-auth";
// EXCEPCION DATA API (APENDICE C de la BIBLIA): lectura/escritura CMS
// server-side via wixData con suppressAuth; ver apendice para el porque
// no se migra a datasets.query('@wix/data').queryDataItems().
// NOTA v5010.7: el acceso fisico a wixData vive en core/locks.js,
// core/transactions.js y core/persistence.js (la fachada ya no lo usa).
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
import {
    _resolveScheduleIdForResource,
    _forceStaffInPristineSlot,
} from "backend/booking/core/scheduleResolver";
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
    _extractResourceIdsFromSlot,
    _areSlotsContiguous,
    _projectCertifiedSlot,
    _projectWriterSlotFromAvailability,
} from "backend/booking/core/validation";
import { _rankResourcesByLoad } from "backend/booking/core/loadRanking";

import {
    PAYMENT_STATUS,
} from "backend/internalConfig";
import {
    _safeTrim,
    getUtcDateFromMadridLocal,
    _hashKey,
} from "public/mmUtils";
import {
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
export { _resolveScheduleIdForResource, _forceStaffInPristineSlot };
export { _initTransaction, _completeTransaction, _failTransaction };
export { _persistBooking, _updateCitaSafe };
export { _extractResourceIdsFromSlot, _areSlotsContiguous, _projectCertifiedSlot, _projectWriterSlotFromAvailability };
export { _rankResourcesByLoad };

// =============================================================================
// BLOQUE 2 - ELEVATED PROXIES (Bookings V2 + eCommerce)
// =============================================================================
// v5010.6: superficie reducida a los proxies con consumidor real.
//   cancelBookingElevated -> bookingSaga (compensacion SAGA-06) + crons.js.
//   confirmOrDecline...   -> bookingSaga (paso ConfirmPresencial, CORE-06).
//   createCheckout/getCheckoutUrl -> bookingSaga (flujo ONLINE).
// createBookingElevated y rescheduleBookingElevated eliminados: cero
// consumidores en src/ y tools/. La creacion usa elevacion selectiva
// (bookingSaga._createBookingWithSelectiveElevation, FIX-37), que solo
// eleva bajo ACCESS_DENIED; el reprogramado no tiene flujo activo.

export const cancelBookingElevated = elevate(bookings.cancelBooking);
export const createCheckoutElevated = elevate(checkout.createCheckout);
export const getCheckoutUrlElevated = elevate(checkout.getCheckoutUrl);

// CORE-06: Mapa paymentStatus SSOT espanol -> enum nativo Wix (BIBLIA 3.2.1).
// Los valores nativos ingleses NO aparecen como clave: pasan sin traduccion,
// lo que garantiza compatibilidad total con consumidores existentes.
const WIX_NATIVE_PAYMENT_STATUS = Object.freeze({
    IMPAGADO: PAYMENT_STATUS.UNPAID,                    // REF: BIBLIA 3.2.1 f4
    NO_PAGADO: PAYMENT_STATUS.NOT_PAID,                 // REF: BIBLIA 3.2.1 f5
    PARCIALMENTE_PAGADO: PAYMENT_STATUS.PARTIALLY_PAID, // REF: SSOT 4 / CORE-06
    PAGADO: PAYMENT_STATUS.PAID,                        // REF: BIBLIA 3.2.1 f8
    REEMBOLSADO: PAYMENT_STATUS.REFUNDED,               // REF: BIBLIA 3.2.1 f9
    REEMBOLSADO_PARCIAL: PAYMENT_STATUS.PARTIALLY_REFUNDED, // REF: BIBLIA 3.2.1 f10
});

function _toWixNativePaymentStatus(value) {
    const v = _safeTrim(value).toUpperCase();
    if (!v) return value;
    return WIX_NATIVE_PAYMENT_STATUS[v] || value;
}

const _confirmOrDeclineElevatedRaw = elevate(bookings.confirmOrDeclineBooking);

/**
 * CORE-06: Wrapper elevado que traduce el paymentStatus del SSOT (espanol)
 * al enum nativo que acepta Wix Bookings. bookingSaga v20.3 envia
 * PAYMENT_STATUS.UNPAID ("IMPAGADO"); sin esta traduccion Wix rechaza la
 * confirmacion presencial.
 *
 * Contrato preservado: (bookingId, options) -> respuesta nativa elevada.
 */
export async function confirmOrDeclineBookingElevated(bookingId, options) {
    let normalizedOptions = options;

    if (options && typeof options === "object" && options.paymentStatus !== undefined) {
        const translated = _toWixNativePaymentStatus(options.paymentStatus);
        if (translated !== options.paymentStatus) {
            log.info("CORE-06: paymentStatus translated SSOT -> Wix native", {
                bookingId: _safeTrim(bookingId),
                from: options.paymentStatus,
                to: translated,
            });
        }
        normalizedOptions = Object.assign({}, options, { paymentStatus: translated });
    }

    return _confirmOrDeclineElevatedRaw(bookingId, normalizedOptions);
}

// Back-compat: some modules historically imported logger from this file.
export { logger };

// =============================================================================
// BLOQUE 7 - CHECKOUT URL HELPER
// =============================================================================

export function _extractCheckoutId(checkoutSession) {
    return checkoutSession?.checkout?._id || checkoutSession?._id || null;
}

// =============================================================================
// BLOQUE 9 - SLOT KEYS
// =============================================================================

export function _generateSlotKey(serviceId, resourceId, startDate, endDate) {
    const startUtc = startDate instanceof Date ? startDate : getUtcDateFromMadridLocal(startDate);
    const endUtc = endDate instanceof Date ? endDate : getUtcDateFromMadridLocal(endDate);
    if (!startUtc || !endUtc || endUtc.getTime() <= startUtc.getTime()) {
        throw createBookingError(ERROR_CODES.INVALID_DATES, "Invalid slot dates for lock key");
    }
    const startEpochMin = Math.floor(startUtc.getTime() / 60000);
    const endEpochMin = Math.floor(endUtc.getTime() / 60000);
    const raw = String(serviceId || "").trim() + "|" + String(resourceId || "").trim() + "|" + startEpochMin + "|" + endEpochMin;
    const prefix = serviceId ? String(serviceId).slice(0, 8) : "srv";
    const staffPrefix = resourceId ? String(resourceId).slice(0, 8) : "nostaff";
    return "slot_" + prefix + "_" + staffPrefix + "_" + _hashKey(raw);
}

export function _buildLockKeys(phases, resourceId) {
    const keys = (phases || []).map(function (p) {
        const slot = p?.rawSlot || {};
        return _generateSlotKey(slot.serviceId, resourceId, p.localStart, p.localEnd);
    });
    return Array.from(new Set(keys)).sort();
}

// =============================================================================
// BLOQUE 20 - PAIR TOKEN CANONICO COMPARTIDO (CORE-05)
// =============================================================================

/**
 * CORE-05: UNICA fuente de verdad de la huella del par dual.
 *
 * v5010.4 (FASE 2): la definicion canonica vive en bookingUtils.js (capa de
 * utilidades puras; precedencia mmUtils > bookingUtils > core > web). Este
 * modulo la importa y la reexporta como superficie publica historica, sin
 * duplicar logica y sin ciclo de imports.
 *
 * IMPORTANTE: esta huella debe ser IDENTICA en los tres puntos donde se
 * genera o consume un pairToken:
 *   1. reservas.web._getCertifiedDualSlotsInternal  (emisor en disponibilidad)
 *   2. bookingSaga._resolveUnifiedPairToken          (consumidor/reemisor)
 *   3. DualSlotCache.pairToken                       (persistencia)
 *
 * Cualquier cambio en el orden o contenido de los campos rompe la
 * correlacion y la idempotencia. Los 8 campos son obligatorios por
 * contrato (los opcionales se serializan como cadena vacia).
 */
export function _buildPairTokenDeterministic(input) {
    return _hashKey(_buildPairFingerprint(input || {}));
}

