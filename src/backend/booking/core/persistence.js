/*
 * ============================================================================
 * FILE: backend/booking/core/persistence.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Persistencia canonica en CitasF2 y actualizacion segura (BLOQUES 11-12).
 *   Extraccion 1:1 de los bloques indicados de bookingCore.js sin cambio
 *   de logica ni contrato. bookingCore.js queda como FACHADA que reexporta.
 * CONSUMERS: exclusivamente backend/booking/bookingCore.js (fachada).
 *   Prohibido importar directamente desde saga/web (regla de oro: una
 *   fachada, un commit; el contrato publico es bookingCore).
 * DEPENDENCIAS: solo wix-data + config + utils => no introduce ciclos.
 * STANDARDS: G10 ASCII strict. node --test compatible.
 * ============================================================================
 */

import wixData from "wix-data";

import { COLLECTIONS } from "backend/internalConfig";
import { logger } from "backend/logger";
import {
    _safeTrim,
    _looksLikeGuid,
    getMadridLocalStringNoZ,
} from "public/mmUtils";
import { ERROR_CODES, BookingError, createBookingError } from "backend/booking/core/errors";

const log = logger;

// =============================================================================
// BLOQUE 11 - PERSISTENCIA EN CITAS_F2 (CORE-07: alias de estado)
// =============================================================================

const CITAS_COL = COLLECTIONS.CITAS_F2;

// CORE-07: alias de pendiente de pago (nativo ingles + SSOT espanol).
const PENDING_PAYMENT_ALIASES = Object.freeze(["PENDING_PAYMENT", "PENDIENTE_PAGO"]);

export async function _persistBooking(params, traceId) {
    const p = params || {};
    const bookingId = p.bookingId;
    const serviceId = p.serviceId;
    const resourceId = p.resourceId;
    const startDate = p.startDate;
    const endDate = p.endDate;
    if (!bookingId || !serviceId || !resourceId || !startDate || !endDate) {
        throw new Error("Missing required fields for persistBooking");
    }

    const scheduleIdClean = _safeTrim(p.scheduleId);
    if (!scheduleIdClean || !_looksLikeGuid(scheduleIdClean)) {
        throw createBookingError(
            ERROR_CODES.INVALID_PAYLOAD,
            "scheduleId is required and must be a valid GUID for CitasF2 persistence",
            { traceId, bookingId: String(bookingId), scheduleIdRaw: p.scheduleId }
        );
    }

    const startDateObj = startDate instanceof Date ? startDate : new Date(startDate);
    const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime()) || endDateObj.getTime() <= startDateObj.getTime()) {
        throw new Error("Invalid startDate/endDate for persistBooking");
    }

    const startLocal = getMadridLocalStringNoZ(startDateObj);
    const dateYmd = startLocal ? startLocal.slice(0, 10) : "";
    const now = new Date();

    const metaPago = String(
        p.paymentStatus || p.meta?.paymentStatus || "UNPAID"
    ).toUpperCase();

    // CORE-07: el status explicito manda (la saga siempre lo envia). La
    // derivacion por paymentStatus reconoce ambas grafias (ingles + SSOT).
    const statusCita = String(
        p.status ||
        p.bookingStatus ||
        (PENDING_PAYMENT_ALIASES.indexOf(metaPago) >= 0 ? "PENDING_PAYMENT" : "CONFIRMED")
    );

    let normalizedMeta = p.meta || {};
    if (typeof normalizedMeta === "string") {
        try { normalizedMeta = JSON.parse(normalizedMeta); } catch (_) { normalizedMeta = {}; }
    }
    if (typeof normalizedMeta !== "object" || normalizedMeta === null || Array.isArray(normalizedMeta)) {
        normalizedMeta = {};
    }
    normalizedMeta = { ...normalizedMeta, status: statusCita, paymentStatus: metaPago };

    const doc = {
        bookingId: String(bookingId),
        pairToken: String(p.pairToken || normalizedMeta.pairToken || ""),
        revision: Number(p.revision) || 1,
        serviceId: String(serviceId),
        scheduleId: scheduleIdClean,
        resourceId: String(resourceId),
        startDate: startDateObj,
        endDate: endDateObj,
        dateYmd,
        bookingType: p.tipo || p.bookingType || "simple",
        status: statusCita,
        paymentStatus: metaPago,
        meta: normalizedMeta,
        contactDetails: p.contactDetails || {},
        traceId: String(traceId || ""),
        _createdDate: now,
        _updatedDate: now,
    };

    const normalizedBookingType = String(doc.bookingType || "simple").toLowerCase();
    if (["dual", "linked", "multi_phase", "dual_f1", "dual_f2"].includes(normalizedBookingType) && !doc.pairToken) {
        throw new Error("Missing pairToken for linked booking");
    }

    const existing = await wixData
        .query(CITAS_COL)
        .eq("bookingId", String(bookingId))
        .limit(1)
        .find({ suppressAuth: true, suppressHooks: true })
        .catch(() => null);

    if (existing?.items?.length > 0) {
        const existingDoc = existing.items[0];
        const incomingRevision = Number(doc.revision) || 1;
        const currentRevision = Number(existingDoc.revision) || 1;
        if (incomingRevision < currentRevision) {
            throw new BookingError(ERROR_CODES.DATABASE_ERROR, "Booking revision conflict", {
                bookingId: String(bookingId),
                currentRevision,
                incomingRevision,
            });
        }
        const updated = { ...existingDoc, ...doc };
        delete updated._createdDate;
        delete updated._updatedDate;
        delete updated._owner;
        const item = await wixData.update(CITAS_COL, updated, { suppressAuth: true, suppressHooks: true });
        return { created: false, item };
    }

    const item = await wixData.insert(CITAS_COL, doc, { suppressAuth: true, suppressHooks: true });
    return { created: true, item };
}

// =============================================================================
// BLOQUE 12 - ACTUALIZACION SEGURA DE CITA
// =============================================================================

export async function _updateCitaSafe(bookingId, updater, traceId, operation) {
    const bid = _safeTrim(bookingId);
    if (!bid) return { updated: false, reason: "INVALID_BOOKING_ID" };

    try {
        const res = await wixData
            .query(CITAS_COL)
            .eq("bookingId", bid)
            .limit(1)
            .find({ suppressAuth: true, suppressHooks: true });

        const cita = res?.items?.[0];
        if (!cita) {
            log.warn("_updateCitaSafe: cita not found", { bookingId: bid, operation, traceId });
            return { updated: false, reason: "NOT_FOUND" };
        }

        const updated = updater(cita);
        if (!updated) return { updated: false, reason: "NO_CHANGE" };

        updated._updatedDate = new Date();
        updated.traceId = traceId || updated.traceId;

        await wixData.update(CITAS_COL, updated, { suppressAuth: true, suppressHooks: true });
        return { updated: true, bookingId: bid };
    } catch (err) {
        log.error("_updateCitaSafe failed", {
            bookingId: bid,
            operation,
            traceId,
            error: err?.message,
        });
        return { updated: false, reason: "ERROR", error: err?.message };
    }
}
