/* MODULE: backend/booking/bookingSaga.impl.js VERSION: v5009-FISCAL-V20.4-SAGA */
import { bookings } from "@wix/bookings";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import {
  COLLECTIONS, CONCURRENCY, SDK_CONFIG, SLOT_SEARCH,
  BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_METHOD,
  COMPENSATION_KIND, COMPENSATION_STATUS, APP_IDS,
} from "backend/internalConfig";
import {
  makeTraceId, _safeTrim, _looksLikeGuid, _stableSerialize, _hashKey,
  getUtcDateFromMadridLocal, getMadridLocalStringNoZ, _normalizeLocalIsoStr,
  _executeWithRetry, withTimeout,
} from "public/mmUtils";
import { computeGapMinutes, cleanGuidList } from "backend/booking/bookingUtils";
import { logger } from "backend/logger";
import {
  cancelBookingElevated, confirmOrDeclineBookingElevated, createCheckoutElevated,
  getCheckoutUrlElevated, _lockSlotKeyOrFail, _unlockSlotKey, _renewLock,
  _initTransaction, _completeTransaction, _failTransaction, _persistBooking,
  _forceStaffInPristineSlot, _resolveScheduleIdForResource, _buildLockKeys,
  createBookingError, normalizeError, ERROR_CODES, _extractCheckoutId,
  _buildPairFingerprint,
} from "backend/booking/bookingCore";
import {
  _resolveServiceIdInternal, _invalidateCachesInternal,
  _getServiceBySlugOrIdInternal, _resolveStaffForSlotInternal,
} from "backend/reservas.web";

const log = logger;
const LOCKTTLMS = Number(CONCURRENCY?.MS_TTL_MUTEX) || 300000;
const HEARTBEATMS = Number(CONCURRENCY?.MS_LATIDO) || 15000;
const CITASCOL = COLLECTIONS.CITAS_F2;
const SERVICIOSCOL = COLLECTIONS.SERVICIOS_CATALOGO;
const COMPENSACIONESCOL = COLLECTIONS.COMPENSACIONES_PENDIENTES;
const MINUTOS_MAX_HUECO_DUAL = Math.max(0, Number(SLOT_SEARCH?.MINUTOS_MAX_HUECO_DUAL) || 120);
const BOOKING_CREATION_TIMEOUT_MS = Number(SDK_CONFIG?.TIMEOUTS?.BOOKING_CREATION_MS) || 25000;
const CHECKOUT_TIMEOUT_MS = Number(SDK_CONFIG?.TIMEOUTS?.CHECKOUT_MS) || 20000;
const API_TIMEOUT_MS = Number(SDK_CONFIG?.TIMEOUTS?.API_MS) || 15000;
const MAX_ADDONS_PER_BOOKING = 5;
const SKIP_AVAILABILITY_VALIDATION = false;
const PAYMENT_STATUS_UNPAID = _safeTrim(PAYMENT_STATUS?.UNPAID) || _safeTrim(PAYMENT_STATUS?.IMPAGADO) || "IMPAGADO";
const PAYMENT_STATUS_PENDING = _safeTrim(PAYMENT_STATUS?.PENDING_PAYMENT) || _safeTrim(PAYMENT_STATUS?.PENDIENTE_PAGO) || "PENDIENTE_PAGO";
const BOOKING_STATUS_CONFIRMED = _safeTrim(BOOKING_STATUS?.CONFIRMED) || _safeTrim(BOOKING_STATUS?.CONFIRMADO) || "CONFIRMADO";
const BOOKING_STATUS_PENDING_PAYMENT = _safeTrim(BOOKING_STATUS?.PENDING_PAYMENT) || _safeTrim(BOOKING_STATUS?.PENDIENTE_PAGO) || "PENDIENTE_PAGO";
const NON_CANCELABLE_STATUSES = new Set([String(BOOKING_STATUS?.CONFIRMED || "").toUpperCase(), String(BOOKING_STATUS?.CANCELLED || "").toUpperCase(), String(BOOKING_STATUS?.REFUNDED || "").toUpperCase(), "CONFIRMED", "CONFIRMADO", "CANCELLED", "CANCELED", "CANCELADO", "REFUNDED", "REEMBOLSADO", "DONE", "COMPLETE"].map(function (v) { return _safeTrim(v).toUpperCase(); }).filter(Boolean));

export function _normalizePersistedMeta(meta) {
  if (!meta) return {};
  try {
    if (typeof meta === "string") {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
    return typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  } catch (_) { return {}; }
}

export class BookingSagaOrchestrator {
  constructor(traceId) {
    this.traceId = traceId;
    this.steps = [];
    this.completedSteps = [];
  }
  addStep(name, executeFn, compensateFn) {
    this.steps.push({ name: name, executeFn: executeFn, compensateFn: compensateFn });
  }
  async execute() {
    for (const step of this.steps) {
      try {
        log.info("Saga step: " + step.name, { traceId: this.traceId });
        const result = await step.executeFn();
        this.completedSteps.push(Object.assign({}, step, { result: result }));
      } catch (error) {
        log.error("Saga step failed: " + step.name, { traceId: this.traceId, error: error?.message });
        await this._compensate();
        throw error;
      }
    }
    return this.completedSteps.map(function (s) { return s.result; });
  }
  async _compensate() {
    const reversed = [].concat(this.completedSteps).reverse();
    for (const step of reversed) {
      if (step.compensateFn) {
        try {
          log.info("Saga compensating: " + step.name, { traceId: this.traceId });
          await step.compensateFn(step.result);
        } catch (compErr) {
          log.error("Saga compensation failed: " + step.name, { traceId: this.traceId, error: compErr?.message });
        }
      }
    }
  }
}

export async function executeBookingSaga(unsafePayload) {
  const full = await import("backend/booking/bookingSaga.full");
  return full.executeBookingSaga(unsafePayload);
}
