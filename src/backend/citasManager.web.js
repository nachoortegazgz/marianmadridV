/*
=============================================================================
MODULE: backend/citasmanager.web.js
VERSION: v5009-FISCAL-V20.7-ALIGNED
RESPONSIBILITY: Safe persistence and retrieval of CitasF2 records.
STANDARDS: G10 ASCII Strict. No Node builtins.
=============================================================================
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { COLLECTIONS } from "backend/internalConfig";
import { _safeTrim } from "public/mmUtils";
import { logger } from "backend/logger";

const log = logger;
const CITAS_COL = COLLECTIONS.CITAS_F2;
const MAX_QUERY_LIMIT = 100;

function _text(value, max = 5000) {
    return _safeTrim(value).slice(0, max);
}

function _status(value) {
    return _text(value).toUpperCase();
}

function _id(value) {
    return _text(value, 300) || null;
}

function _public(item) {
    if (!item || typeof item !== "object") return null;
    return {
        id: item._id || null,
        bookingId: item.bookingId || null,
        pairToken: item.pairToken || null,
        serviceId: item.serviceId || null,
        linkedF1BookingId: item.linkedF1BookingId || null,
        scheduleId: item.scheduleId || null,
        resourceId: item.resourceId || null,
        staffResourceId: item.staffResourceId || null,
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        dateYmd: item.dateYmd || null,
        bookingType: item.bookingType || null,
        status: item.bookingStatus || item.status || null,
        paymentStatus: item.paymentStatus || null,
        contactDetails: item.contactDetails || null,
        locationId: item.locationId || null,
        meta: item.meta || null,
        traceId: item.traceId || null,
    };
}

export async function _getCitaByBookingId(bookingId, traceId = null) {
    const bid = _id(bookingId);
    if (!bid) return null;
    try {
        const result = await wixData.query(CITAS_COL)
            .eq("bookingId", bid)
            .limit(1)
            .find({ suppressAuth: true, suppressHooks: true });
        return result?.items?.[0] || null;
    } catch (error) {
        log.error("_getCitaByBookingId failed", { bookingId: bid, traceId, error: error?.message });
        throw error;
    }
}

export async function _getCitasByPairToken(pairToken, traceId = null) {
    const token = _id(pairToken);
    if (!token) return [];
    try {
        const result = await wixData.query(CITAS_COL)
            .eq("pairToken", token)
            .limit(MAX_QUERY_LIMIT)
            .find({ suppressAuth: true, suppressHooks: true });
        return result?.items || [];
    } catch (error) {
        log.error("_getCitasByPairToken failed", { pairToken: token, traceId, error: error?.message });
        throw error;
    }
}

export async function _updateCitaSafe(bookingId, updater, traceId = null, operation = "update") {
    const bid = _id(bookingId);
    if (!bid || typeof updater !== "function") return { updated: false, reason: "INVALID_INPUT" };

    try {
        const existing = await _getCitaByBookingId(bid, traceId);
        if (!existing) return { updated: false, reason: "NOT_FOUND" };

        const next = updater(Object.assign({}, existing));
        if (!next || typeof next !== "object") return { updated: false, reason: "NO_CHANGE" };

        delete next._createdDate;
        delete next._updatedDate;
        delete next._owner;
        next._id = existing._id;
        next.traceId = traceId || next.traceId || existing.traceId;

        const item = await wixData.update(CITAS_COL, next, {
            suppressAuth: true,
            suppressHooks: true,
        });
        return { updated: true, item: _public(item) };
    } catch (error) {
        log.error("_updateCitaSafe failed", { bookingId: bid, operation, traceId, error: error?.message });
        return { updated: false, reason: "ERROR", error: error?.message };
    }
}

export const getCitaByBookingId = webMethod(
    Permissions.Anyone,
    async function (bookingId) {
        const item = await _getCitaByBookingId(bookingId);
        return { status: "SUCCESS", data: _public(item), error: null };
    }
);

export const getCitasByPairToken = webMethod(
    Permissions.Anyone,
    async function (pairToken) {
        const items = await _getCitasByPairToken(pairToken);
        return { status: "SUCCESS", data: items.map(_public), error: null };
    }
);

export const updateCitaStatus = webMethod(
    Permissions.Anyone,
    async function (payload) {
        const input = payload && typeof payload === "object" ? payload : {};
        const bookingId = _id(input.bookingId);
        const bookingStatus = _status(input.bookingStatus || input.status);
        const paymentStatus = _status(input.paymentStatus);
        const traceId = _text(input.traceId, 200) || null;

        if (!bookingId || (!bookingStatus && !paymentStatus)) {
            return { status: "ERROR", data: null, error: { code: "INVALID_PAYLOAD", message: "bookingId and a status are required" } };
        }

        const result = await _updateCitaSafe(
            bookingId,
            function (item) {
                if (bookingStatus) {
                    item.bookingStatus = bookingStatus;
                    item.status = bookingStatus;
                }
                if (paymentStatus) item.paymentStatus = paymentStatus;
                return item;
            },
            traceId,
            "updateCitaStatus"
        );

        return {
            status: result.updated ? "SUCCESS" : "ERROR",
            data: result.updated ? result.item : null,
            error: result.updated ? null : { code: result.reason || "UPDATE_FAILED", message: "Cita could not be updated" },
        };
    }
);
