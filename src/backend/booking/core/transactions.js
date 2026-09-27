/*
 * ============================================================================
 * FILE: backend/booking/core/transactions.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Transacciones idempotentes sobre BookingTransactions (BLOQUE 10, CORE-07).
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

import { CONCURRENCY, COLLECTIONS } from "backend/internalConfig";
import { _isDuplicateItemError } from "backend/booking/core/locks";
import { createBookingError } from "backend/booking/core/errors";

// =============================================================================
// BLOQUE 10 - TRANSACCIONES IDEMPOTENTES (BookingTransactions) - CORE-07
// =============================================================================

const TRANSACTIONS_COL = COLLECTIONS.BOOKING_TRANSACTIONS;

// CORE-07: tolerancia al renombrado V20 (BIBLIA 3.2.1).
// SIN EQUIVALENTE V20 DOCUMENTADO en BIBLIA 3.2.1 para estas dos claves
// (grep verifico: MS_SONDEO_TRANSACCION / MS_ESPERA_MAX_TRANSACCION no
// existen en la norma). Se mantiene el nombre actual como canonico del SSOT.
const TRANSACTION_POLL_BASE_MS = Number(CONCURRENCY?.TRANSACTION_POLL_BASE_MS) || 250;
const TRANSACTION_MAX_WAIT_MS = Number(CONCURRENCY?.TRANSACTION_MAX_WAIT_MS) || 3000;

async function _getTransactionById(pairToken) {
    const id = String(pairToken || "");
    if (!id) return null;
    return await wixData.get(TRANSACTIONS_COL, id, { suppressAuth: true, consistentRead: true }).catch(() => null);
}

export async function _initTransaction(pairToken, payloadHash, traceId) {
    const id = String(pairToken || "");
    if (!id) return { success: false, error: "INVALID_PAIR_TOKEN" };

    try {
        await wixData.insert(
            TRANSACTIONS_COL,
            {
                _id: id,
                pairToken: id,
                status: "PENDING",
                payloadHash,
                traceId,
                _createdDate: new Date(),
                _updatedDate: new Date(),
            },
            { suppressAuth: true }
        );
        return { success: true, isNew: true };
    } catch (error) {
        if (!_isDuplicateItemError(error)) throw error;

        const startTime = Date.now();
        let pollAttempt = 0;
        while (Date.now() - startTime < TRANSACTION_MAX_WAIT_MS) {
            const existing = await _getTransactionById(id);
            if (existing) {
                if (String(existing.payloadHash || "") !== String(payloadHash || "")) {
                    return { success: false, error: "PAIR_TOKEN_PAYLOAD_MISMATCH" };
                }
                if (existing.status === "COMPLETED") return { success: true, isNew: false, existing };
                if (existing.status === "FAILED") {
                    return { success: false, error: "TRANSACTION_PREVIOUSLY_FAILED", existing };
                }
            }
            const remainingMs = TRANSACTION_MAX_WAIT_MS - (Date.now() - startTime);
            const delay = Math.min(
                Math.floor(TRANSACTION_POLL_BASE_MS * Math.pow(2, Math.min(pollAttempt, 3)) * (0.5 + Math.random())),
                remainingMs
            );
            if (delay <= 0) break;
            pollAttempt++;
            await new Promise(function (r) { setTimeout(r, delay); });
        }

        const existing = await _getTransactionById(id);
        if (existing) {
            if (String(existing.payloadHash || "") !== String(payloadHash || "")) {
                return { success: false, error: "PAIR_TOKEN_PAYLOAD_MISMATCH" };
            }
            return { success: false, error: "TRANSACTION_TIMEOUT", existing, timeout: true };
        }
        return { success: false, error: "TRANSACTION_TIMEOUT" };
    }
}

export async function _completeTransaction(pairToken, result, traceId) {
    const id = String(pairToken || "");
    if (!id) return;
    const existing = await _getTransactionById(id);
    if (existing && existing.status === "COMPLETED") return;
    const doc = {
        ...(existing || {}),
        _id: id,
        pairToken: id,
        status: "COMPLETED",
        result,
        ownerTraceId: String(traceId || existing?.ownerTraceId || ""),
        _updatedDate: new Date(),
        _createdDate: existing?._createdDate || new Date(),
    };
    if (existing) await wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true });
    else await wixData.insert(TRANSACTIONS_COL, doc, { suppressAuth: true });
}

export async function _failTransaction(pairToken, errorMessage) {
    const id = String(pairToken || "");
    if (!id) return;
    const existing = await _getTransactionById(id);
    if (existing && existing.status === "COMPLETED") return;
    const doc = {
        ...(existing || {}),
        _id: id,
        pairToken: id,
        status: "FAILED",
        error: String(errorMessage || "UNKNOWN_ERROR"),
        _updatedDate: new Date(),
        _createdDate: existing?._createdDate || new Date(),
    };
    if (existing) await wixData.update(TRANSACTIONS_COL, doc, { suppressAuth: true }).catch(() => null);
    else await wixData.insert(TRANSACTIONS_COL, doc, { suppressAuth: true }).catch(() => null);
}
