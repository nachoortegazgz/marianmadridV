/*
=============================================================================
MODULE: backend/booking/bookingSaga.js
VERSION: v5009-FISCAL-V20.4-SAGA
BASE: v5009-FISCAL-V20.2 + Afinado final contra BIBLIA v4
SSOT: SSOT CONSOLIDADO v5002.6 | BIBLIA v5009-V20-FINAL-CONSOLIDATED-v4
MISSION: Orquestador transaccional. Saga compensable para reservas simples
         y duales con gap de exposicion. Gestiona locks, heartbeat,
         idempotencia triple capa y creacion SECUENCIAL F1 -> F2.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).

FIXES APLICADOS v5009-FISCAL-V20.3:
  - SAGA-01: skipAvailabilityValidation = false (BIBLIA 2.2 regla 7:
             "no desactivar nativo"). Wix re-valida disponibilidad real.
  - SAGA-02: pairToken UNIFICADO. Prioridad absoluta al token emitido por
             reservas.web.getCertifiedDualSlots. Fallback dual determinista
             con la MISMA huella (_buildPairFingerprint, unica definicion en
             bookingUtils y reexportada por bookingCore; sin copia local).
             Fallback simple por _resolveStablePairToken.
  - SAGA-03: OWNER_BUSINESS GARANTIZADO. Resolucion de locationId con
             cascada (slot validado -> catalogo) + _assertPristineSlotContract
             que BLOQUEA la creacion si el slot no cumple BIBLIA 2.2.1.
  - SAGA-04: Addons inyectados (addOnIds) en bookedEntity.slot de F1 y F2,
             con validacion de limite BIBLIA 3.2 (MAX_POR_RESERVA = 5).
  - SAGA-05: PAYMENT_STATUS.UNPAID en confirmOrDecline (sin literales).
  - SAGA-06: Compensacion NO cancela reservas CONFIRMED/CANCELLED/REFUNDED.
             Compara contra enum nativo Wix Y valor SSOT espanol (BIBLIA
             3.2.1: CONFIRMED -> CONFIRMADO, CANCELLED -> CANCELADO).
  - SAGA-07: Constantes de configuracion V20 canonicas (BIBLIA 3.2.1
             f13/f15/f16: MS_TTL_MUTEX, MS_LATIDO, MINUTOS_MAX_HUECO_DUAL).
             v5010.4 FASE 2: cascadas legacy eliminadas; internalConfig ya
             solo expone los nombres V20.
  - SAGA-08: availableStaff con fallback (staffDisponible, staffMemberIds).
  - SAGA-09: selectedPaymentOption ONLINE en create cuando path eCom
             (requerido por Writer V2 + Wix eCommerce checkout).

NOTA CONTRACTUAL (BIBLIA 2.2.1):
  bookedEntity.slot.serviceId      -> GUID servicio
  bookedEntity.slot.scheduleId     -> GUID schedule (obligatorio)
  bookedEntity.slot.startDate      -> ISO UTC con Z
  bookedEntity.slot.endDate        -> ISO UTC con Z
  bookedEntity.slot.timezone       -> Europe/Madrid
  bookedEntity.slot.resource.id    -> GUID recurso
  bookedEntity.slot.location       -> { id, locationType: OWNER_BUSINESS }
  contactDetails                   -> objeto contacto
  totalParticipants                -> 1
=============================================================================
*/

import { bookings } from "@wix/bookings";
import { elevate } from "wix-auth";
import wixData from "wix-data";

import {
    COLLECTIONS,
    CONCURRENCY,
    SDK_CONFIG,
    SLOT_SEARCH,
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHOD,
    COMPENSATION_KIND,
    COMPENSATION_STATUS,
    APP_IDS,
} from "backend/internalConfig";

import {
    makeTraceId,
    _safeTrim,
    _looksLikeGuid,
    _stableSerialize,
    _hashKey,
    getUtcDateFromMadridLocal,
    getMadridLocalStringNoZ,
    _normalizeLocalIsoStr,
    _executeWithRetry,
    withTimeout,
} from "public/mmUtils";

import {
    computeGapMinutes,
    cleanGuidList,
} from "backend/booking/bookingUtils";

import { logger } from "backend/logger";

import {
    cancelBookingElevated,
    confirmOrDeclineBookingElevated,
    createCheckoutElevated,
    getCheckoutUrlElevated,
    _lockSlotKeyOrFail,
    _unlockSlotKey,
    _renewLock,
    _initTransaction,
    _completeTransaction,
    _failTransaction,
    _persistBooking,
    _forceStaffInPristineSlot,
    _resolveScheduleIdForResource,
    _buildLockKeys,
    createBookingError,
    normalizeError,
    ERROR_CODES,
    _extractCheckoutId,
    _buildPairFingerprint,
} from "backend/booking/bookingCore";

export { _extractCheckoutId };

import {
    _resolveServiceIdInternal,
    _invalidateCachesInternal,
    _getServiceBySlugOrIdInternal,
    _resolveStaffForSlotInternal,
} from "backend/reservas.web";

const log = logger;
const LOCKTTLMS = Number(CONCURRENCY?.MS_TTL_MUTEX) || 300000;
const HEARTBEATMS = Number(CONCURRENCY?.MS_LATIDO) || 15000;
const CITASCOL = COLLECTIONS.CITAS_F2;
const SERVICIOSCOL = COLLECTIONS.SERVICIOS_CATALOGO;
const COMPENSACIONESCOL = COLLECTIONS.COMPENSACIONES_PENDIENTES;
const MINUTOS_MAX_HUECO_DUAL = Math.max(
    0,
    Number(SLOT_SEARCH?.MINUTOS_MAX_HUECO_DUAL) || 120
);
const BOOKING_CREATION_TIMEOUT_MS =
    Number(SDK_CONFIG?.TIMEOUTS?.BOOKING_CREATION_MS) || 25000;
const CHECKOUT_TIMEOUT_MS =
    Number(SDK_CONFIG?.TIMEOUTS?.CHECKOUT_MS) || 20000;
const API_TIMEOUT_MS =
    Number(SDK_CONFIG?.TIMEOUTS?.API_MS) || 15000;
const MAX_ADDONS_PER_BOOKING = 5;
const SKIP_AVAILABILITY_VALIDATION = false;
const PAYMENT_STATUS_UNPAID =
    _safeTrim(PAYMENT_STATUS?.UNPAID) ||
    _safeTrim(PAYMENT_STATUS?.IMPAGADO) ||
    "IMPAGADO";
const PAYMENT_STATUS_PENDING =
    _safeTrim(PAYMENT_STATUS?.PENDING_PAYMENT) ||
    _safeTrim(PAYMENT_STATUS?.PENDIENTE_PAGO) ||
    "PENDIENTE_PAGO";
const BOOKING_STATUS_CONFIRMED =
    _safeTrim(BOOKING_STATUS?.CONFIRMED) ||
    _safeTrim(BOOKING_STATUS?.CONFIRMADO) ||
    "CONFIRMADO";
const BOOKING_STATUS_PENDING_PAYMENT =
    _safeTrim(BOOKING_STATUS?.PENDING_PAYMENT) ||
    _safeTrim(BOOKING_STATUS?.PENDIENTE_PAGO) ||
    "PENDIENTE_PAGO";
const NON_CANCELABLE_STATUSES = new Set(
    [
        String(BOOKING_STATUS?.CONFIRMED || "").toUpperCase(),
        String(BOOKING_STATUS?.CANCELLED || "").toUpperCase(),
        String(BOOKING_STATUS?.REFUNDED || "").toUpperCase(),
        "CONFIRMED",
        "CONFIRMADO",
        "CANCELLED",
        "CANCELED",
        "CANCELADO",
        "REFUNDED",
        "REEMBOLSADO",
        "DONE",
        "COMPLETE",
    ]
        .map(function (v) { return _safeTrim(v).toUpperCase(); })
        .filter(Boolean)
);

function _resolveStablePairToken({ serviceId, resourceId, f1Start, f2Start, email }) {
    const emailHash = _hashKey(_safeTrim(email).toLowerCase());
    const payload = _stableSerialize({
        serviceId: _safeTrim(serviceId),
        resourceId: _safeTrim(resourceId),
        f1Start: _safeTrim(f1Start),
        f2Start: _safeTrim(f2Start || ""),
    });
    const hash = _hashKey(payload + "|" + emailHash);
    return "pt_" + hash.slice(0, 32);
}

function _resolveUnifiedPairToken({
    suppliedPairToken,
    isDual,
    serviceId,
    linkedPhases,
    f1Start,
    f1End,
    f2Start,
    f2End,
    resourceId,
    email,
    traceId,
}) {
    const supplied = _safeTrim(suppliedPairToken);
    if (supplied) {
        return { pairToken: supplied, source: "SUPPLIED" };
    }
    if (isDual && _looksLikeGuid(resourceId)) {
        const fingerprint = _buildPairFingerprint({
            serviceId: serviceId,
            linkedPhases: linkedPhases,
            dateYMD: _safeTrim(f1Start).slice(0, 10),
            f1Start: f1Start,
            f1End: f1End,
            f2Start: f2Start,
            f2End: f2End,
            resourceId: resourceId,
        });
        return { pairToken: _hashKey(fingerprint), source: "FINGERPRINT" };
    }
    if (isDual) {
        log.warn(
            "SAGA-02: dual booking without supplied pairToken and without explicit " +
            "resourceId. Falling back to STABLE token (includes email hash), which " +
            "will NOT match getCertifiedDualSlots output. Frontend must forward " +
            "the pairToken returned by the availability query.",
            { traceId: traceId, serviceId: serviceId }
        );
    }
    return {
        pairToken: _resolveStablePairToken({
            serviceId: serviceId,
            resourceId: resourceId,
            f1Start: f1Start,
            f2Start: f2Start,
            email: email,
        }),
        source: isDual ? "STABLE_DEGRADED" : "STABLE",
    };
}

export function _normalizePersistedMeta(meta) {
    if (!meta) return {};
    try {
        if (typeof meta === "string") {
            const parsed = JSON.parse(meta);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : {};
        }
        return typeof meta === "object" && !Array.isArray(meta)
            ? meta
            : {};
    } catch (_) {
        return {};
    }
}

function _isGuidOrNull(value) {
    const v = _safeTrim(value);
    if (!v) return null;
    return _looksLikeGuid(v) ? v : null;
}

async function _bestEffortUnlockAll(lockKeys, lockOwnerId) {
    for (const key of lockKeys || []) {
        try {
            await _unlockSlotKey(key, lockOwnerId);
        } catch (e) {
            log.warn("_bestEffortUnlockAll: failed to unlock", {
                key: key,
                error: e?.message,
            });
        }
    }
}

async function _compensateCreatedBookings(createdBookings, traceId) {
    for (const booking of createdBookings || []) {
        const bookingId = booking?.bookingId || booking?.id;
        if (!bookingId) continue;
        const status = _safeTrim(booking?.status).toUpperCase();
        if (status && NON_CANCELABLE_STATUSES.has(status)) {
            log.warn("Skipping compensation for non-cancelable booking", {
                bookingId: bookingId,
                status: status,
                phase: booking?.phase || null,
                traceId: traceId,
            });
            continue;
        }
        try {
            await _executeWithRetry(
                () =>
                    withTimeout(
                        () => cancelBookingElevated(bookingId, { suppressAuth: true }),
                        API_TIMEOUT_MS,
                        "cancelBookingCompensation"
                    ),
                2,
                300
            );
            log.info("Compensated booking cancelled", {
                bookingId: bookingId,
                traceId: traceId,
            });
        } catch (cancelErr) {
            log.error("Compensation cancel failed; queuing", {
                bookingId: bookingId,
                traceId: traceId,
                error: cancelErr?.message,
            });
            try {
                await wixData.insert(
                    COMPENSACIONESCOL,
                    {
                        id: "COMP_" + bookingId + "_" + Date.now(),
                        kind: COMPENSATION_KIND.CANCEL_BOOKING,
                        compensationKind: COMPENSATION_KIND.CANCEL_BOOKING,
                        bookingId: bookingId,
                        phase: booking?.phase || "UNKNOWN",
                        status: COMPENSATION_STATUS.PENDING,
                        compensationStatus: COMPENSATION_STATUS.PENDING,
                        attempts: 0,
                        totalAmount: 0,
                        paymentMethod: null,
                        transactionId: null,
                        orderId: null,
                        refundId: null,
                        operationDescription: "Booking compensation after saga failure",
                        movementType: null,
                        alertRequired: true,
                        lastError: cancelErr?.message || "UNKNOWN",
                        traceId: traceId,
                        _createdDate: new Date(),
                        _updatedDate: new Date(),
                    },
                    { suppressAuth: true }
                );
            } catch (queueErr) {
                log.error("Failed to queue compensation", {
                    bookingId: bookingId,
                    traceId: traceId,
                    error: queueErr?.message,
                });
            }
        }
    }
}

async function _createBookingWithSelectiveElevation(booking, options, traceId) {
    try {
        return await withTimeout(
            () => bookings.createBooking(booking, options),
            BOOKING_CREATION_TIMEOUT_MS,
            "createBooking"
        );
    } catch (err) {
        const code = _safeTrim(
            err?.code || err?.details?.applicationError?.code
        ).toUpperCase();
        const isAccessDenied =
            code === "ACCESS_DENIED" ||
            String(err?.message || "").toUpperCase().includes("ACCESS_DENIED");
        if (!isAccessDenied) throw err;
        log.info("Elevating createBooking due to ACCESS_DENIED", { traceId: traceId });
        return await withTimeout(
            () => elevate(bookings.createBooking)(booking, options),
            BOOKING_CREATION_TIMEOUT_MS,
            "createBooking:elevated"
        );
    }
}

function _validateCreateBookingResponse(booking, phase, traceId) {
    const id = _safeTrim(booking?.id || booking?._id);
    if (!id || !_looksLikeGuid(id)) {
        log.error("CreateBooking returned invalid booking", {
            phase,
            traceId,
            hasId: Boolean(booking?.id),
            has_id: Boolean(booking?._id),
        });
        throw createBookingError(
            ERROR_CODES.BOOKING_CREATION_FAILED,
            "Booking " + phase + " created but no valid ID returned",
            { traceId, phase }
        );
    }
    const revisionRaw = booking?.revision ?? booking?.revisionNumber ?? null;
    const revisionNum = Number(revisionRaw);
    const revision =
        Number.isFinite(revisionNum) && revisionNum > 0 ? revisionNum : null;
    if (revision === null) {
        log.warn("CreateBooking returned no revision; defaulting to 1 in CitasF2", {
            phase,
            traceId,
            bookingId: id,
        });
    }
    return {
        bookingId: id,
        revision: revision,
        status: _safeTrim(booking?.status) || null,
    };
}

function _checkDoubleBookingFlag(booking, phase, traceId) {
    if (booking?.doubleBooked === true) {
        log.warn("Wix doubleBooked flag detected", {
            phase,
            bookingId: booking?.id,
            traceId,
        });
    }
}

function _validateDualGap(f1LocalEnd, f2LocalStart, traceId) {
    const gapMinutes = computeGapMinutes(f1LocalEnd, f2LocalStart);
    if (gapMinutes === null || gapMinutes < 0) {
        throw createBookingError(
            ERROR_CODES.INVALID_PAYLOAD,
            "Invalid dual gap (negative or unparseable)",
            { traceId, f1LocalEnd, f2LocalStart, gapMinutes }
        );
    }
    if (gapMinutes > MINUTOS_MAX_HUECO_DUAL) {
        throw createBookingError(
            ERROR_CODES.INVALID_PAYLOAD,
            "Dual gap exceeds MAX_DUAL_GAP_MINUTES",
            { traceId, gapMinutes, maxGapMinutes: MINUTOS_MAX_HUECO_DUAL }
        );
    }
    return { gapMinutes, maxGapMinutes: MINUTOS_MAX_HUECO_DUAL };
}
/* SIZE_TEST_20K_END */
