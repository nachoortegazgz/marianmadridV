/*
 * ============================================================================
 * FILE: backend/booking/core/validation.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Validacion y proyeccion determinista de slots (BLOQUES 17-18, CORE-01..05).
 *   Extraccion 1:1 de los bloques indicados de bookingCore.js sin cambio
 *   de logica ni contrato. bookingCore.js queda como FACHADA que reexporta.
 * CONSUMERS: exclusivamente backend/booking/bookingCore.js (fachada).
 *   Prohibido importar directamente desde saga/web (regla de oro: una
 *   fachada, un commit; el contrato publico es bookingCore).
 * DEPENDENCIAS: solo wix-data + config + utils => no introduce ciclos.
 * STANDARDS: G10 ASCII strict. node --test compatible.
 * ============================================================================
 */

import { logger } from "backend/logger";
import { SDK_CONFIG, SLOT_SEARCH } from "backend/internalConfig";
import {
    _safeTrim,
    _looksLikeGuid,
    getUtcDateFromMadridLocal,
    _normalizeLocalIsoStr,
} from "public/mmUtils";
import { computeGapMinutes, getResourceIdsFromSlot } from "backend/booking/bookingUtils";
import { STAFF_RESOURCE_TYPE_ID, CONFIGURED_LOCATION_ID } from "backend/booking/core/config";

const log = logger;

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

// =============================================================================
// BLOQUE 17 - VERIFICACION DE CONTIGUIDAD/GAP ENTRE SLOTS
// =============================================================================

export function _areSlotsContiguous(slot1, slot2, maxGapMinutes) {
    if (!slot1 || !slot2) return false;
    // SSOT: cuando el llamador no fija limite explicito, la tolerancia canonica
    // es SLOT_SEARCH.MINUTOS_TOLERANCIA (BIBLIA 3.2.1 f12), no un magic number.
    const fallbackTolerance = Number(SLOT_SEARCH?.MINUTOS_TOLERANCIA);
    const maxGap = maxGapMinutes == null
        ? (Number.isFinite(fallbackTolerance) ? fallbackTolerance : 120)
        : maxGapMinutes;
    const end1 = slot1.localEndDate || slot1.endDate;
    const start2 = slot2.localStartDate || slot2.startDate;
    if (!end1 || !start2) return false;

    const end1Utc = end1 instanceof Date ? end1 : getUtcDateFromMadridLocal(_normalizeLocalIsoStr(end1));
    const start2Utc = start2 instanceof Date ? start2 : getUtcDateFromMadridLocal(_normalizeLocalIsoStr(start2));
    if (!end1Utc || !start2Utc) return false;

    const rawDiffMinutes = (start2Utc.getTime() - end1Utc.getTime()) / 60000;

    if (rawDiffMinutes < -1) return false;

    const gapMinutes = computeGapMinutes(end1Utc, start2Utc);

    return gapMinutes <= maxGap;
}

// =============================================================================
// BLOQUE 18 - PROYECCION DE SLOTS CERTIFICADOS Y WRITER (CORE-03, CORE-04)
// =============================================================================

/**
 * CORE-04: locationId validado contra SDK_CONFIG.LOCATION_ID.
 * - Slot con otra ubicacion  -> null (fail-fast, nunca sustitucion silenciosa).
 * - Sin ubicacion util o sin GUID -> null.
 */

// CORE-10 (v5010.7): extraccion canonica de addOnIds de un slot.
// Paridad 1:1 con la definicion original de bookingCore.js (HEAD~ refactor).
export function _extractAddonIdsFromSlot(slot) {
    const candidates = [].concat(
        Array.isArray(slot?.addOnIds) ? slot.addOnIds : [],
        Array.isArray(slot?.selectedAddOns) ? slot.selectedAddOns : [],
        Array.isArray(slot?.customerChoices?.addOnIds) ? slot.customerChoices.addOnIds : []
    );

    const clean = candidates
        .map(function (id) { return _safeTrim(id); })
        .filter(function (id) { return _looksLikeGuid(id); });

    return Array.from(new Set(clean));
}

export function _projectCertifiedSlot(slot, resourceId) {
    if (!slot || typeof slot !== "object") return null;

    const serviceId = _safeTrim(slot.serviceId);
    if (!serviceId || !_looksLikeGuid(serviceId)) return null;

    const resourceIdClean = _safeTrim(resourceId || slot.resourceId || slot.resource?.id);
    if (!resourceIdClean || !_looksLikeGuid(resourceIdClean)) return null;

    const localStartDate = _normalizeLocalIsoStr(slot.localStartDate || slot.startDate);
    const localEndDate = _normalizeLocalIsoStr(slot.localEndDate || slot.endDate);

    if (!localStartDate || !localEndDate) return null;

    const startDateUtc = getUtcDateFromMadridLocal(localStartDate);
    const endDateUtc = getUtcDateFromMadridLocal(localEndDate);

    if (!startDateUtc || !endDateUtc || endDateUtc.getTime() <= startDateUtc.getTime()) return null;

    // CORE-04: validacion de ubicacion.
    const slotLocationId = _safeTrim(slot.location?.id);

    if (
        slotLocationId &&
        CONFIGURED_LOCATION_ID &&
        slotLocationId !== CONFIGURED_LOCATION_ID
    ) {
        log.warn("_projectCertifiedSlot: slot location does not match configured location", {
            slotLocationId,
            configuredLocationId: CONFIGURED_LOCATION_ID,
            serviceId,
        });
        return null;
    }

    const locationId = slotLocationId || CONFIGURED_LOCATION_ID;

    if (!locationId || !_looksLikeGuid(locationId)) {
        log.warn("_projectCertifiedSlot: missing or invalid locationId", {
            slotLocationId,
            configuredLocationId: CONFIGURED_LOCATION_ID,
            serviceId,
        });
        return null;
    }

    return {
        serviceId,
        resourceId: resourceIdClean,
        scheduleId: _safeTrim(slot.scheduleId || slot.slot?.scheduleId || ""),
        localStartDate,
        localEndDate,
        startDate: startDateUtc,
        endDate: endDateUtc,
        bookable: slot.bookable === true,
        availableResources: _extractResourceIdsFromSlot(slot),
        timezone: SDK_CONFIG?.TZ || "Europe/Madrid",
        locationId,
        locationName: _safeTrim(slot.location?.name || ""),
        formattedAddress: _safeTrim(slot.location?.formattedAddress || ""),
    };
}

/**
 * CORE-03: el Writer V2 exige scheduleId GUID valido (BIBLIA 2.2.1 fila 4).
 * Cascada: projected -> slot -> slot.slot. Si no hay scheduleId util,
 * devuelve null EN VEZ de proyectar scheduleId: "".
 */
export function _projectWriterSlotFromAvailability(slot, resourceId, serviceId) {
    const projected = _projectCertifiedSlot(slot, resourceId);
    if (!projected) return null;

    const finalServiceId = _safeTrim(serviceId) || projected.serviceId;
    if (!finalServiceId || !_looksLikeGuid(finalServiceId)) return null;

    const scheduleId = _safeTrim(
        projected.scheduleId ||
        slot.scheduleId ||
        slot.slot?.scheduleId
    );

    if (!scheduleId || !_looksLikeGuid(scheduleId)) {
        log.warn("_projectWriterSlotFromAvailability: missing or invalid scheduleId", {
            serviceId: finalServiceId,
            scheduleIdRaw: projected.scheduleId || null,
        });
        return null;
    }

    let writerLocationType = _safeTrim(SDK_CONFIG?.LOCATION_TYPES?.BOOKINGS_WRITER);
    if (writerLocationType === "BUSINESS" || !writerLocationType) writerLocationType = "OWNER_BUSINESS";

    const writerSlot = {
        serviceId: finalServiceId,
        scheduleId,
        startDate: projected.startDate,
        endDate: projected.endDate,
        timezone: projected.timezone,
        resource: {
            id: projected.resourceId,
        },
        location: {
            id: projected.locationId,
            locationType: writerLocationType,
        },
    };

    // CORE-02: propagar addons si el slot certificado los porta.
    const addOnIds = _extractAddonIdsFromSlot(slot);
    if (addOnIds.length > 0) {
        writerSlot.addOnIds = addOnIds.slice();
        writerSlot.selectedAddOns = addOnIds.slice();
    }

    return writerSlot;
}
