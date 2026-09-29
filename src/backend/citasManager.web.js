/*
MODULE: backend/citasManager.web.js
VERSION: v5010.8-BOOKING-FACADE
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { COLLECTIONS, PAYMENT_METHOD } from "backend/internalConfig";
import { makeTraceId, _safeTrim } from "public/mmUtils";
import { logger } from "backend/logger";
import { executeBookingSaga } from "backend/booking/bookingSaga";
import { registerBookingPayment } from "backend/cajas.web";

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
function _publicError(error, fallbackCode) {
  const code =
    _safeTrim(error?.code || error?.details?.applicationError?.code) ||
    fallbackCode ||
    "BOOKING_FAILED";
  return {
    status: "ERROR",
    data: null,
    error: { code: code, message: _safeTrim(error?.message) || "Booking request failed" },
  };
}

export async function _getCitaByBookingId(bookingId, traceId = null) {
  const bid = _id(bookingId);
  if (!bid) return null;
  try {
    const result = await wixData
      .query(CITAS_COL)
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
    const result = await wixData
      .query(CITAS_COL)
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
    const item = await wixData.update(CITAS_COL, next, { suppressAuth: true, suppressHooks: true });
    return { updated: true, item: _public(item) };
  } catch (error) {
    log.error("_updateCitaSafe failed", { bookingId: bid, operation, traceId, error: error?.message });
    return { updated: false, reason: "ERROR", error: error?.message };
  }
}

/** Dual = two simple appointments + gap (NOT Multi Service Booking). */
export const processDualBooking = webMethod(Permissions.Anyone, async function (payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const traceId = _safeTrim(input.traceId) || makeTraceId("process-dual");
  try {
    const email = _safeTrim(input.email || input.contactDetails?.email || input.metaCita?.email);
    if (!email) {
      return { status: "ERROR", data: null, error: { code: "INVALID_PAYLOAD", message: "Email is required" } };
    }
    const serviceId = _safeTrim(input.serviceId);
    if (!serviceId) {
      return { status: "ERROR", data: null, error: { code: "INVALID_PAYLOAD", message: "serviceId is required" } };
    }
    const slotF1 = input.slotF1 || {};
    if (!_safeTrim(slotF1.localStartDate || slotF1.start) || !_safeTrim(slotF1.localEndDate || slotF1.end)) {
      return {
        status: "ERROR",
        data: null,
        error: { code: "INVALID_PAYLOAD", message: "F1 slot localStartDate/localEndDate required" },
      };
    }
    const paymentMethod = _safeTrim(
      input.paymentMethod || input.method || PAYMENT_METHOD?.ONLINE || "ONLINE"
    ).toUpperCase();
    const sagaPayload = Object.assign({}, input, {
      email: email,
      serviceId: serviceId,
      paymentMethod: paymentMethod,
      traceId: traceId,
    });
    log.info("processDualBooking start", {
      traceId,
      serviceId,
      paymentMethod,
      hasSlotF2: Boolean(input.slotF2),
      hasPairToken: Boolean(_safeTrim(input.pairToken)),
    });
    const result = await executeBookingSaga(sagaPayload);
    if (result && (result.status === "SUCCESS" || result.status === "ERROR")) return result;
    return { status: "SUCCESS", data: result?.data || result || null, error: null };
  } catch (error) {
    log.error("processDualBooking failed", { traceId, error: error?.message, code: error?.code });
    return _publicError(error, "BOOKING_FAILED");
  }
});

export const confirmPayment = webMethod(Permissions.SiteMember, async function (payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const traceId = _safeTrim(input.traceId) || makeTraceId("confirm-pay");
  const orderId = _safeTrim(input.orderId);
  const bookingIdsRaw = input.bookingIds || input.bookingId || [];
  const bookingIds = (Array.isArray(bookingIdsRaw) ? bookingIdsRaw : String(bookingIdsRaw).split(","))
    .map(function (id) { return _safeTrim(id); })
    .filter(Boolean);
  try {
    if (!orderId || !bookingIds.length) {
      return { status: "ERROR", data: null, error: { code: "INVALID_PAYLOAD", message: "orderId and bookingIds are required" } };
    }
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { status: "ERROR", data: null, error: { code: "INVALID_AMOUNT", message: "Positive amount is required" } };
    }
    const primary = (await _getCitaByBookingId(bookingIds[0], traceId)) || {};
    const linked = bookingIds.join(",");
    const method = _safeTrim(input.paymentMethod) || _safeTrim(PAYMENT_METHOD?.ONLINE) || "ONLINE";
    const ledgerResult = await registerBookingPayment(linked, amount, method, {
      concept: _safeTrim(input.concept) || "Online booking payment",
      resourceId: _safeTrim(primary.resourceId) || _safeTrim(primary.staffResourceId) || "online",
      staffResourceId: _safeTrim(primary.resourceId) || _safeTrim(primary.staffResourceId) || null,
      dateYmd: _safeTrim(primary.dateYmd) || null,
      pairToken: _safeTrim(primary.pairToken) || null,
      bookingType: _safeTrim(primary.bookingType) || null,
      serviceId: _safeTrim(primary.serviceId) || null,
      transactionId: "ORDER-" + orderId,
      orderId: orderId,
      origen: "WIX_ECOM_PAYMENT_CONFIRM",
      tipoMovimiento: "VENTA_ONLINE",
      traceId: traceId,
    });
    if (ledgerResult?.status !== "SUCCESS") {
      return {
        status: "ERROR",
        data: ledgerResult?.data || null,
        error: ledgerResult?.error || { code: "LEDGER_FAILED", message: "Payment ledger registration failed" },
      };
    }
    for (const bid of bookingIds) {
      await _updateCitaSafe(
        bid,
        function (item) {
          item.paymentStatus = "PAID";
          item.bookingStatus = item.bookingStatus || item.status || "CONFIRMED";
          item.status = item.bookingStatus;
          item.orderId = orderId;
          return item;
        },
        traceId,
        "confirmPayment"
      );
    }
    return { status: "SUCCESS", data: { orderId, bookingIds, ledger: ledgerResult?.data || null }, error: null };
  } catch (error) {
    log.error("confirmPayment failed", { traceId, error: error?.message });
    return _publicError(error, "CONFIRM_PAYMENT_FAILED");
  }
});

export const getCitaByBookingId = webMethod(Permissions.Anyone, async function (bookingId) {
  const item = await _getCitaByBookingId(bookingId);
  return { status: "SUCCESS", data: _public(item), error: null };
});

export const getCitasByPairToken = webMethod(Permissions.Anyone, async function (pairToken) {
  const items = await _getCitasByPairToken(pairToken);
  return { status: "SUCCESS", data: items.map(_public), error: null };
});

export const updateCitaStatus = webMethod(Permissions.SiteMember, async function (payload) {
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
});
