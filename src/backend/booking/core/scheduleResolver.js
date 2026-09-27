/*
 * ============================================================================
 * FILE: backend/booking/core/scheduleResolver.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Resolucion de scheduleId con fallback controlado (BLOQUE 5, CORE-16/17).
 *   Extraccion 1:1 de los bloques indicados de bookingCore.js sin cambio
 *   de logica ni contrato. bookingCore.js queda como FACHADA que reexporta.
 * CONSUMERS: exclusivamente backend/booking/bookingCore.js (fachada).
 *   Prohibido importar directamente desde saga/web (regla de oro: una
 *   fachada, un commit; el contrato publico es bookingCore).
 * DEPENDENCIAS: solo wix-data + config + utils => no introduce ciclos.
 * STANDARDS: G10 ASCII strict. node --test compatible.
 * ============================================================================
 */

import { getStaffScheduleId } from "backend/staff";
import { logger } from "backend/logger";
import { SDK_CONFIG, CONCURRENCY } from "backend/internalConfig";
import {
    _safeTrim,
    _looksLikeGuid,
    getUtcDateFromMadridLocal,
    getMadridLocalStringNoZ,
} from "public/mmUtils";
import { _extractAddonIdsFromSlot } from "backend/booking/core/validation";
import { CONFIGURED_LOCATION_ID } from "backend/booking/core/config";

const log = logger;

// =============================================================================
// BLOQUE 5 - RESOLUCION DE SCHEDULEID (FALLBACK CONTROLADO)
// =============================================================================

async function _resolveScheduleIdByResourceId(resourceId) {
    const id = _safeTrim(resourceId);
    if (!id || !_looksLikeGuid(id)) return null;
    const scheduleId = await getStaffScheduleId(id);
    return scheduleId && _looksLikeGuid(scheduleId) ? scheduleId : null;
}

export async function _resolveScheduleIdForResource(resourceId, sourceSlot) {
    const resourceIdClean = _safeTrim(resourceId);
    if (!resourceIdClean || !_looksLikeGuid(resourceIdClean)) return null;

    const s = (sourceSlot && typeof sourceSlot === "object") ? sourceSlot : {};
    let scheduleId = _safeTrim(
        s.scheduleId || s.slot?.scheduleId || s.schedule?.id || s.resource?.scheduleId || ""
    );
    if (scheduleId && _looksLikeGuid(scheduleId)) return scheduleId;

    scheduleId = await _resolveScheduleIdByResourceId(resourceIdClean);
    return scheduleId || null;
}

// =============================================================================
// BLOQUE 6 - NORMALIZACION DE SLOTS PARA WRITER V2 (CORE-02, CORE-04)
// =============================================================================

// CORE-02: la extraccion tolerante de addons (_extractAddonIdsFromSlot) tiene
// su UNICA implementacion en core/validation.js (importada arriba). Antes se
// duplicaba aqui; deduplicado v5010.7 post-refactor (paridad 1:1 verificada).

export async function _forceStaffInPristineSlot(slot, resourceId, serviceIdOverride, defaultDurationMinutes) {
    if (!slot || typeof slot !== "object") return null;

    const serviceId = _safeTrim(serviceIdOverride || slot.serviceId);
    if (!serviceId || !_looksLikeGuid(serviceId)) {
        log.error("_forceStaffInPristineSlot: invalid serviceId", { serviceId });
        return null;
    }

    const resourceIdClean = _safeTrim(resourceId || slot.resourceId || slot.resource?.id);
    if (!resourceIdClean || !_looksLikeGuid(resourceIdClean)) {
        log.error("_forceStaffInPristineSlot: invalid resourceId", { resourceIdClean });
        return null;
    }

    let scheduleId = _safeTrim(
        slot.scheduleId || slot.slot?.scheduleId || slot.schedule?.id || slot.resource?.scheduleId || ""
    );
    if (!scheduleId) {
        scheduleId = await _resolveScheduleIdByResourceId(resourceIdClean);
    }
    if (!scheduleId || !_looksLikeGuid(scheduleId)) {
        log.error("_forceStaffInPristineSlot: missing scheduleId", { resourceId: resourceIdClean });
        return null;
    }

    let localStartDate = "";
    const rawStart = slot.localStartDate || slot.startDate;
    if (rawStart instanceof Date) localStartDate = getMadridLocalStringNoZ(rawStart);
    else if (typeof rawStart === "string" && rawStart.endsWith("Z")) {
        const utcDt = new Date(rawStart);
        localStartDate = !isNaN(utcDt.getTime()) ? getMadridLocalStringNoZ(utcDt) : "";
    } else localStartDate = _safeTrim(rawStart);
    if (!localStartDate) return null;

    let localEndDate = "";
    const rawEnd = slot.localEndDate || slot.endDate;
    if (rawEnd instanceof Date) localEndDate = getMadridLocalStringNoZ(rawEnd);
    else if (typeof rawEnd === "string" && rawEnd.endsWith("Z")) {
        const utcDt = new Date(rawEnd);
        localEndDate = !isNaN(utcDt.getTime()) ? getMadridLocalStringNoZ(utcDt) : "";
    } else localEndDate = _safeTrim(rawEnd);

    if (!localEndDate) {
        const startUtc = getUtcDateFromMadridLocal(localStartDate);
        if (!startUtc) return null;
        const durationMin = Number(defaultDurationMinutes || CONCURRENCY?.DEFAULT_DURATION_MIN || 30);
        localEndDate = getMadridLocalStringNoZ(new Date(startUtc.getTime() + durationMin * 60 * 1000));
    }

    const startDate = getUtcDateFromMadridLocal(localStartDate);
    const endDate = getUtcDateFromMadridLocal(localEndDate);
    if (!startDate || !endDate) return null;

    if (endDate.getTime() <= startDate.getTime()) {
        log.error("_forceStaffInPristineSlot: invalid date range (endDate <= startDate)", {
            localStartDate,
            localEndDate,
            resourceId: resourceIdClean,
            serviceId,
        });
        return null;
    }

    // CORE-04: validacion de ubicacion entrante contra la configurada.
    // Si el slot trae OTRA ubicacion, fail-fast: nunca se sustituye en
    // silencio (evitaria crear la reserva en un local equivocado).
    const incomingLocationId = _safeTrim(slot.location?.id);
    if (
        incomingLocationId &&
        CONFIGURED_LOCATION_ID &&
        incomingLocationId !== CONFIGURED_LOCATION_ID
    ) {
        log.error("_forceStaffInPristineSlot: slot location conflicts with configured location", {
            slotLocationId: incomingLocationId,
            configuredLocationId: CONFIGURED_LOCATION_ID,
            serviceId,
        });
        return null;
    }

    const locationId = CONFIGURED_LOCATION_ID || incomingLocationId;
    if (!locationId || !_looksLikeGuid(locationId)) {
        log.error("_forceStaffInPristineSlot: missing or invalid LOCATION_ID", {
            configuredLocationId: CONFIGURED_LOCATION_ID,
            incomingLocationId: incomingLocationId,
        });
        return null;
    }

    // BIBLIA 2.2.1 fila 8: creacion SIEMPRE con OWNER_BUSINESS.
    let locationType = _safeTrim(SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER) || "OWNER_BUSINESS";
    if (locationType === "BUSINESS") locationType = "OWNER_BUSINESS";
    const timezone = _safeTrim(SDK_CONFIG?.TZ) || "Europe/Madrid";

    const result = {
        serviceId,
        scheduleId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timezone,
        resource: { id: resourceIdClean },
        location: { id: locationId, locationType },
    };

    // CORE-02: preservar addons para createBooking. Se emiten ambas claves
    // porque bookingSaga v20.3 inyecta addOnIds + selectedAddOns y el
    // contrato del Writer V2 ha usado historicamente las dos formas.
    const addOnIds = _extractAddonIdsFromSlot(slot);
    if (addOnIds.length > 0) {
        result.addOnIds = addOnIds.slice();
        result.selectedAddOns = addOnIds.slice();
    }

    return result;
}

// =============================================================================
// BLOQUE 7 - CHECKOUT URL HELPER
// =============================================================================

export function _extractCheckoutId(checkoutSession) {
    return checkoutSession?.checkout?._id || checkoutSession?._id || null;
}
