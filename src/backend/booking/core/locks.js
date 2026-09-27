/**
 * ============================================================================
 * FILE: backend/booking/core/locks.js
 * VERSION: v5010.7 (FASE 3, bloque 3 - extraccion CORE-08 "locks")
 * RESPONSIBILITY: Mutex distribuido sobre SlotLocks (CORE-08). Extraccion
 *   1:1 de BLOQUE 8 de bookingCore.js sin cambio de logica ni contrato.
 *   bookingCore.js queda como FACHADA que reexporta esta superficie.
 * CONSUMERS: exclusivamente backend/booking/bookingCore.js (fachada).
 *   Prohibido importar este modulo desde saga/web: el contrato publico es
 *   la fachada (regla de oro del bloque 3: una fachada, un commit).
 * DEPENDENCIAS: wix-data, public/mmUtils, backend/internalConfig,
 *   backend/logger. Ninguna dependencia hacia bookingCore/bookingSaga/
 *   reservas.web => no introduce ciclos.
 * STANDARDS: G10 ASCII strict. node --test compatible.
 * ============================================================================
 */

import wixData from "wix-data";

import { CONCURRENCY, COLLECTIONS } from "backend/internalConfig";
import { logger } from "backend/logger";
import {
    _safeTrim,
    _toDateSafe,
    makeTraceId,
    _hashKey,
} from "public/mmUtils";

const log = logger;

const MUTEX_TTL_MS = Number(CONCURRENCY?.MS_TTL_MUTEX);

const LOCKS_COL = COLLECTIONS.SLOT_LOCKS;

export function _safeLockId(key) {
    const k = String(key || "").trim();
    if (!k) return "";
    return "lk_" + _hashKey(k) + "_" + k.slice(0, 24);
}

export async function _getLock(slotClave) {
    const k = String(slotClave || "");
    if (!k) return null;
    const item = await wixData
        .get(LOCKS_COL, _safeLockId(k), { suppressAuth: true, consistentRead: true })
        .catch(() => null);
    if (!item) return null;
    if (item.expiresAt) item.expiresAt = _toDateSafe(item.expiresAt);
    return item;
}

export function _getLockOwnerId(lock) {
    if (!lock || typeof lock !== "object") return "";
    return _safeTrim(lock.lockOwnerId || lock.traceId || "");
}

export function _isDuplicateItemError(error) {
    const message = String(error?.message || "");
    return message.includes("WDE0123") || message.includes("WD_ITEM_ALREADY_EXISTS") || message.includes("Duplicated");
}

export function _buildLockDocument(slotClave, lockOwnerId, ttlMs, existing) {
    const now = new Date();
    return {
        ...(existing || {}),
        _id: _safeLockId(slotClave),
        slotKey: String(slotClave),
        lockOwnerId: String(lockOwnerId || makeTraceId("lock")),
        expiresAt: new Date(Date.now() + (Number(ttlMs) || MUTEX_TTL_MS)),
        _createdDate: existing?._createdDate ? _toDateSafe(existing._createdDate) || now : now,
        _updatedDate: now,
    };
}

export async function _lockSlotKeyOrFail(slotClave, lockOwnerId, ttlMs) {
    const k = String(slotClave || "");
    const owner = String(lockOwnerId || "").trim();
    if (!k || !owner) return { ok: false, message: "LOCK_KEY_OR_OWNER_INVALID" };

    try {
        await wixData.insert(LOCKS_COL, _buildLockDocument(k, owner, ttlMs), { suppressAuth: true });
        return { ok: true, acquired: true };
    } catch (error) {
        if (!_isDuplicateItemError(error)) {
            log.error("_lockSlotKeyOrFail failed", { slotClave: k, error: error?.message });
            return { ok: false, message: error?.message || "Lock acquisition failed" };
        }
        const existing = await _getLock(k);
        const currentOwner = _getLockOwnerId(existing);
        if (currentOwner === owner) {
            const renewed = await _renewLock(k, owner, ttlMs);
            return renewed.ok ? { ok: true, renewed: true } : { ok: false, message: "LOCK_RENEWAL_FAILED" };
        }
        const expiresAt = _toDateSafe(existing?.expiresAt);
        const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
        if (expired && existing?._id) {
            await wixData.remove(LOCKS_COL, existing._id, { suppressAuth: true }).catch(() => null);
            try {
                await wixData.insert(LOCKS_COL, _buildLockDocument(k, owner, ttlMs), { suppressAuth: true });
                return { ok: true, acquired: true, reclaimed: true };
            } catch (_) {
                return { ok: false, message: "LOCK_HELD_BY_ANOTHER_OWNER" };
            }
        }
        return { ok: false, message: "LOCK_HELD_BY_ANOTHER_OWNER" };
    }
}

export async function _unlockSlotKey(slotClave, lockOwnerId) {
    const owner = String(lockOwnerId || "").trim();
    const existing = await _getLock(slotClave);
    if (!existing) return { ok: true, missing: true };
    const currentOwner = _getLockOwnerId(existing);
    if (!owner || currentOwner !== owner) return { ok: false, skipped: true };
    await wixData.remove(LOCKS_COL, existing._id, { suppressAuth: true });
    return { ok: true };
}

export async function _renewLock(slotClave, lockOwnerId, ttlMs) {
    try {
        const owner = String(lockOwnerId || "").trim();
        const existing = await _getLock(slotClave);
        if (!existing) return { ok: false };
        const currentOwner = _getLockOwnerId(existing);
        if (!owner || currentOwner !== owner) return { ok: false };
        await wixData.update(LOCKS_COL, _buildLockDocument(slotClave, owner, ttlMs, existing), { suppressAuth: true });
        return { ok: true };
    } catch (error) {
        log.error("_renewLock failed", { slotClave, error: error?.message });
        return { ok: false };
    }
}
