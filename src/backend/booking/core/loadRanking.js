/*
 * ============================================================================
 * FILE: backend/booking/core/loadRanking.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Ranking de recursos por carga del dia (BLOQUE 21, CORE-07).
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

import { COLLECTIONS, INACTIVE_BOOKING_STATUSES } from "backend/internalConfig";
import { logger } from "backend/logger";
import { _safeTrim, _looksLikeGuid } from "public/mmUtils";

const log = logger;

const CITAS_COL = COLLECTIONS.CITAS_F2;

// =============================================================================
// BLOQUE 21 - RANKING DE RECURSOS POR CARGA (CORE-07)
// =============================================================================

// CORE-07 v5010.5: unico alias de dominio permitido (grafia del SSOT
// espanol; BIBLIA 3.2.1). El equivalente en ingles ("CANCELLED") NO es un
// alias aqui: los ESTADOS de reserva ya estan cubiertos por
// INACTIVE_BOOKING_STATUSES (lista canonica: CANCELLED, DECLINED, REJECTED,
// NOSHOW). En cambio, los PAGOS no tienen enum canonicode cancelacion en
// PAYMENT_STATUS (internalConfig), por lo que "CANCELADO"/"CANCELED" se
// toleran como abonos anulados. Una sola grafia por concepto: cero
// duplicacion con el SSOT.
const CANCELLED_PAYMENT_ALIASES = Object.freeze([
    "CANCELADO", "CANCELED",
]);

export async function _rankResourcesByLoad(resourceIds, dateYMD, traceId) {
    const input = Array.isArray(resourceIds) ?
        Array.from(new Set(resourceIds.map((id) => _safeTrim(id)).filter(_looksLikeGuid))) : [];

    if (input.length < 2) return input;

    const day = _safeTrim(dateYMD);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        log.warn("_rankResourcesByLoad: invalid dateYMD", { dateYMD: day, traceId });
        return input;
    }

    const loads = Object.fromEntries(input.map((id, index) => [id, {
        resourceId: id,
        load: 0,
        firstIndex: index,
    }]));

    // CORE-07: defensa ante INACTIVE_BOOKING_STATUSES ausente o no-array
    // (p. ej. durante la migracion a ESTADOS_CITA_INACTIVOS).
    const inactiveList = Array.isArray(INACTIVE_BOOKING_STATUSES)
        ? INACTIVE_BOOKING_STATUSES.map((s) => String(s || "").toUpperCase()).filter(Boolean)
        : [];

    try {
        const pageSize = 1000;
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const result = await wixData
                .query(CITAS_COL)
                .eq("dateYmd", day)
                .in("resourceId", input)
                .limit(pageSize)
                .skip(skip)
                .find({ suppressAuth: true, consistentRead: true });

            const items = Array.isArray(result?.items) ? result.items : [];

            for (const item of items) {
                const resourceId = _safeTrim(item?.resourceId);
                if (!loads[resourceId]) continue;

                // CORE-07: tolerancia bookingStatus (canonico V20) || status.
                const status = String(item?.bookingStatus || item?.status || "").toUpperCase();
                const paymentStatus = String(item?.paymentStatus || "").toUpperCase();

                const cancelled =
                    inactiveList.indexOf(status) >= 0;
                const ignoredPayment = CANCELLED_PAYMENT_ALIASES.indexOf(paymentStatus) >= 0;

                if (!cancelled && !ignoredPayment) loads[resourceId].load += 1;
            }

            skip += items.length;
            hasMore = items.length === pageSize;
            if (!items.length) hasMore = false;
        }

        return Object.values(loads)
            .sort((a, b) => a.load - b.load || a.firstIndex - b.firstIndex)
            .map((entry) => entry.resourceId);
    } catch (error) {
        log.warn("_rankResourcesByLoad failed; preserving availability order", {
            traceId,
            dateYMD: day,
            error: error?.message,
        });
        return input;
    }
}
