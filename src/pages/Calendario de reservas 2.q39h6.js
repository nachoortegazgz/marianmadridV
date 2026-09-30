// FILE: src/pages/calendario-2.js
/*
=============================================================================
MODULE: pages/calendario-2.js
VERSION: v5011-F1-CALENDAR-CANONICAL
BASE NORMATIVA:
  - BIBLIA2 / BIBLIAV (v5009-V20-FINAL-CONSOLIDATED-v4.2) Bloques 3, 4.2.3, 4.3, 4.6
  - CAMBIO.txt secciones 3, 5, 9, 11, 13
  - Dossier CMS vivo 30/09/2026 (ServiciosCatalogo rev.88 / ComplementosCatalogo rev.3)

DECISIONES DE ALINEACION (Fase 1):
  1. Cero alias legacy en lectura de URL y payloads:
       slugUrl        -> ELIMINADO (CAMBIO.txt 3 / R19: slug unico)
       addonIds       -> addOnIds  (clave tecnica ComplementosCatalogo: addOnId)
       addonId        -> addOnId
       dateYMD        -> dateYmd   (BIBLIA 4.6 / 4.8)
       imageUrl       -> mainMedia (clave tecnica ServiciosCatalogo)
       phase2ServiceId<- linkedPhases (REFERENCE, GUID Wix preservado)
  2. Cero spread del DTO backend: proyeccion por lista blanca. Ningun campo
     fiscal, de coste o de notas internas (tipoImpositivo, codigoImpuesto,
     claveRegimen, cuentaContable*, costPrice, margin, internalNotes) entra
     en estado de pagina ni viaja al widget HTML (BIBLIAV 24).
  3. Constantes de negocio locales y congeladas (SITE, LIMITS, enums). El
     frontend NO importa backend/internalConfig: la frontera es el Web Method.
  4. Idempotencia de cliente: clientRequestId por intento + guarda
     anti doble envio. El pairToken sigue siendo responsabilidad exclusiva
     del backend (BIBLIAV 0.1 / 4.4).
  5. Validacion dual en frontera: F2 posterior a F1 y GAP <= 120 min
     (BIBLIA 3.2 / 4.3 filas 15-17) antes de consumir processDualBooking.
  6. Errores: codigo estable para el widget + mensaje publico higienizado.
     El detalle tecnico solo via console con traceId (nunca al usuario).
=============================================================================
*/

import wixLocation from "wix-location-frontend";
import wixWindow from "wix-window-frontend";

import {
  getServiceBySlugOrId,
  getAvailableDays,
  getAvailableSlots,
  getCertifiedDualSlots,
  resolveStaffForSlot
} from "backend/reservas.web";

import { processDualBooking } from "backend/citasManager.web";

import {
  MESSAGE_TYPES,
  URLS,
  UI,
  makeTraceId,
  _safeTrim,
  _safeSlugOrId,
  _looksLikeGuid,
  withTimeout
} from "public/mmUtils";

import { createWidgetBridge } from "public/widgetBridge";

/* ============================================================================
 * 1. CONSTANTES DE MODULO (congeladas, sin magia dispersa)
 * ==========================================================================*/

const SITE = Object.freeze({
  TIMEZONE: "Europe/Madrid",
  CURRENCY: "EUR"
});

const RESULT_STATUS = Object.freeze({
  SUCCESS: "SUCCESS",
  ERROR: "ERROR"
});

/** R19: identidad de pago Wix preservada en ingles camelCase. */
const PAYMENT_METHOD = Object.freeze({
  ONLINE: "ONLINE"
});

/** D10: enums internos en espanol MAYUSCULAS. */
const CATALOG_STATUS = Object.freeze({
  ACTIVO: "ACTIVO",
  INACTIVO: "INACTIVO",
  BORRADOR: "BORRADOR"
});

const AVAILABILITY_ACTION = Object.freeze({
  DAYS: "days",
  SLOTS: "slots"
});

const NAV_TARGET = Object.freeze({
  SERVICIOS: "SERVICIOS",
  PRIVACY: "PRIVACY"
});

const LIMITS = Object.freeze({
  /** BOOKINGS_ADDON_CONFIG.MAX_POR_RESERVA (BIBLIA 3.2). */
  MAX_ADDONS_POR_RESERVA: 5,
  /** SLOT_SEARCH.MINUTOS_MAX_HUECO_DUAL (BIBLIA 3.2). */
  MINUTOS_MAX_HUECO_DUAL: 120,
  /** SLOT_SEARCH.MINUTOS_TOLERANCIA (BIBLIA 3.2). */
  MINUTOS_TOLERANCIA: 10
});

const DEFAULTS = Object.freeze({
  FRONTEND_API_TIMEOUT_MS: 60000,
  WIDGET_ID: "#htmlWidgetCalendario",
  CONFIRMATION_LIGHTBOX: "ConfirmacionReserva",
  SERVICES_URL: "/reserva-online",
  PRIVACY_URL: "/politica-de-privacidad",
  CALENDAR_REFERRAL: "calendario-2"
});

const ERROR_CODE = Object.freeze({
  INVALID_SERVICE_IDENTITY: "INVALID_SERVICE_IDENTITY",
  WIDGET_UNAVAILABLE: "WIDGET_UNAVAILABLE",
  BRIDGE_INIT_FAILED: "BRIDGE_INIT_FAILED",
  SERVICE_CONTEXT_NOT_READY: "SERVICE_CONTEXT_NOT_READY",
  SERVICE_NOT_AVAILABLE: "SERVICE_NOT_AVAILABLE",
  SERVICE_LOAD_FAILED: "SERVICE_LOAD_FAILED",
  INVALID_AVAILABILITY_REQUEST: "INVALID_AVAILABILITY_REQUEST",
  INVALID_DATE: "INVALID_DATE",
  EMPTY_AVAILABILITY_RESPONSE: "EMPTY_AVAILABILITY_RESPONSE",
  AVAILABILITY_FAILED: "AVAILABILITY_FAILED",
  INVALID_SLOT: "INVALID_SLOT",
  INVALID_DUAL_SLOT: "INVALID_DUAL_SLOT",
  DUAL_GAP_EXCEEDED: "DUAL_GAP_EXCEEDED",
  STAFF_RESOLVE_FAILED: "STAFF_RESOLVE_FAILED",
  INVALID_BOOKING_PAYLOAD: "INVALID_BOOKING_PAYLOAD",
  BOOKING_IN_PROGRESS: "BOOKING_IN_PROGRESS",
  EMPTY_BOOKING_RESPONSE: "EMPTY_BOOKING_RESPONSE",
  BOOKING_FAILED: "BOOKING_FAILED"
});

const PUBLIC_MESSAGE = Object.freeze({
  SERVICE_CONTEXT_NOT_READY: "El servicio todavia se esta cargando.",
  SERVICE_NOT_AVAILABLE: "El servicio solicitado no esta disponible.",
  SERVICE_LOAD_FAILED: "No se pudo cargar el servicio.",
  INVALID_SERVICE_IDENTITY: "El servicio no tiene un identificador valido.",
  INVALID_AVAILABILITY_REQUEST: "Solicitud de disponibilidad no valida.",
  INVALID_DATE: "La fecha seleccionada no es valida.",
  EMPTY_AVAILABILITY_RESPONSE: "No se recibio disponibilidad.",
  AVAILABILITY_FAILED: "No se pudo obtener disponibilidad.",
  INVALID_SLOT: "El intervalo seleccionado no es valido.",
  INVALID_DUAL_SLOT: "Falta el horario de la segunda fase.",
  DUAL_GAP_EXCEEDED: "El intervalo entre fases supera el maximo permitido.",
  STAFF_RESOLVE_FAILED: "No se pudo validar el profesional.",
  INVALID_BOOKING_PAYLOAD: "Los datos de la reserva no son validos.",
  BOOKING_IN_PROGRESS: "Ya hay una reserva en curso.",
  EMPTY_BOOKING_RESPONSE: "No se recibio respuesta de la reserva.",
  BOOKING_FAILED: "No se pudo completar la reserva.",
  WIDGET_UNAVAILABLE: "El widget del calendario no esta disponible."
});

/** Formato local canonico de franja: YYYY-MM-DDTHH:mm (BIBLIA 4.2.3). */
const LOCAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/**
 * Lista blanca de proyeccion hacia el widget. Todo lo que no este aqui
 * no existe para la capa de presentacion.
 */
const PUBLIC_SERVICE_FIELDS = Object.freeze([
  "serviceId",
  "slug",
  "title",
  "description",
  "tagLine",
  "mainMedia",
  "imageUrl",
  "price",
  "currency",
  "totalDuration",
  "phase1Duration",
  "phase2Duration",
  "exposureDuration",
  "durationRange",
  "allowCombine",
  "phase2ServiceId",
  "addOns",
  "location",
  "serviceType",
  "onlinePayment",
  "inPersonPayment",
  "depositType",
  "depositAmount",
  "pricingModel",
  "referral",
  "preselectedAddOnIds",
  "timeZone",
  "currencyCode",
  "metadata"
]);

/* ============================================================================
 * 2. HELPERS GENERICOS (clave tecnica canonica, sin cadena de alias)
 * ==========================================================================*/

function text(value, fallback = "") {
  return _safeTrim(value) || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();
    if (clean === "true") return true;
    if (clean === "false") return false;
  }
  return fallback;
}

function isGuid(value) {
  return _looksLikeGuid(text(value)) === true;
}

/** REFERENCIA simple (REFERENCE): string | {_id} | {id} | {value}. */
function getReferenceId(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return text(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? getReferenceId(value[0]) : "";
  }
  if (typeof value === "object") {
    return text(value._id || value.id || value.referenceId || value.value);
  }
  return "";
}

/** MULTI_REFERENCE: lista de IDs tecnicos, unica y sin invencion de referencias. */
function getReferenceIds(value) {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value : [value];
  const ids = raw
    .map((entry) => (typeof entry === "string" ? text(entry) : getReferenceId(entry)))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function frontendTimeoutMs() {
  return number(UI?.FRONTEND_API_TIMEOUT_MS, DEFAULTS.FRONTEND_API_TIMEOUT_MS);
}

function buildErrorResult(code, publicMessage) {
  return {
    status: RESULT_STATUS.ERROR,
    data: null,
    error: {
      code,
      message: text(publicMessage, PUBLIC_MESSAGE.BOOKING_FAILED)
    }
  };
}

function buildSuccessResult(data) {
  return {
    status: RESULT_STATUS.SUCCESS,
    data: data ?? null,
    error: null
  };
}

function isSuccessResult(result) {
  return Boolean(result) && result.status === RESULT_STATUS.SUCCESS;
}

/**
 * Normaliza un resultado de Web Method al contrato unico de pagina.
 * Un resultado nulo o sin `status` se trata siempre como error.
 */
function normalizeWebResult(result, fallbackCode) {
  if (!result || typeof result !== "object") {
    return buildErrorResult(fallbackCode, PUBLIC_MESSAGE[fallbackCode]);
  }
  if (result.status === RESULT_STATUS.SUCCESS) {
    return buildSuccessResult(result.data ?? null);
  }
  const code = text(result.error?.code, fallbackCode);
  const message = text(result.error?.message, PUBLIC_MESSAGE[fallbackCode]);
  return buildErrorResult(code, message);
}

function createClientRequestId(traceId) {
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${traceId}:${globalCrypto.randomUUID()}`;
  }
  return `${traceId}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ============================================================================
 * 3. VALIDACION DE FRANJAS Y ARITMETICA DUAL
 * ==========================================================================*/

function isLocalDateTime(value) {
  return LOCAL_DATETIME_PATTERN.test(text(value));
}

/**
 * Parsea "YYYY-MM-DDTHH:mm" como instantes comparables sin depender del
 * huso del navegador: la resta de minutos es exacta y determinista.
 */
function parseLocalDateTime(value) {
  const clean = text(value);
  if (!isLocalDateTime(clean)) {
    return null;
  }
  const [datePart, timePart] = clean.split("T");
  const [year, month, day] = datePart.split("-").map((part) => Number(part));
  const timeSegments = timePart.split(":").map((part) => Number(part));
  const [hour, minute, second = 0] = timeSegments;

  if (![year, month, day, hour, minute, second].every((part) => Number.isFinite(part))) {
    return null;
  }

  const millis = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(millis) ? millis : null;
}

function diffMinutes(startValue, endValue) {
  const start = parseLocalDateTime(startValue);
  const end = parseLocalDateTime(endValue);
  if (start === null || end === null) {
    return null;
  }
  return (end - start) / 60000;
}

/**
 * Contrato dual (BIBLIA 4.3 filas 15-17):
 *   - F1 y F2 con intervalo local valido.
 *   - F2 comienza despues de que F1 termine.
 *   - GAP (exposicion) entre 0 y MINUTOS_MAX_HUECO_DUAL.
 */
function validateDualSlots(slotF1, slotF2) {
  if (!slotF1 || !slotF2 || typeof slotF1 !== "object" || typeof slotF2 !== "object") {
    return { ok: false, code: ERROR_CODE.INVALID_DUAL_SLOT };
  }

  const f1Start = text(slotF1.localStartDate);
  const f1End = text(slotF1.localEndDate);
  const f2Start = text(slotF2.localStartDate);
  const f2End = text(slotF2.localEndDate);

  if (![f1Start, f1End, f2Start, f2End].every(isLocalDateTime)) {
    return { ok: false, code: ERROR_CODE.INVALID_SLOT };
  }

  const f1Duration = diffMinutes(f1Start, f1End);
  const f2Duration = diffMinutes(f2Start, f2End);
  if (f1Duration === null || f2Duration === null || f1Duration <= 0 || f2Duration <= 0) {
    return { ok: false, code: ERROR_CODE.INVALID_SLOT };
  }

  const gapMinutes = diffMinutes(f1End, f2Start);
  if (gapMinutes === null || gapMinutes < 0) {
    return { ok: false, code: ERROR_CODE.INVALID_DUAL_SLOT };
  }
  if (gapMinutes > LIMITS.MINUTOS_MAX_HUECO_DUAL) {
    return { ok: false, code: ERROR_CODE.DUAL_GAP_EXCEEDED };
  }

  return { ok: true, gapMinutes };
}

/** Coherencia de duraciones del servicio dual: total = fase1 + exposicion + fase2. */
function auditServiceDurations(service, traceId) {
  if (!service.allowCombine) {
    return;
  }
  const expected = service.phase1Duration + service.exposureDuration + service.phase2Duration;
  if (service.totalDuration > 0 && expected > 0 && expected !== service.totalDuration) {
    console.warn("[calendario-2] Aritmetica dual incoherente en catalogo", {
      traceId,
      serviceId: service.serviceId,
      totalDuration: service.totalDuration,
      sumaFases: expected
    });
  }
}

/* ============================================================================
 * 4. PROYECCION CANONICA DEL SERVICIO (ServiciosCatalogo -> DTO de pagina)
 * ==========================================================================*/

function normalizeAddOn(entry) {
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    const id = text(entry);
    if (!id) {
      return null;
    }
    return {
      addOnId: id,
      nativeId: "",
      title: "",
      price: 0,
      currency: SITE.CURRENCY,
      durationInMinutes: 0,
      maxQuantity: 1,
      active: true
    };
  }
  if (typeof entry !== "object") {
    return null;
  }

  // Clave tecnica canonica de ComplementosCatalogo: addOnId.
  const addOnId = getReferenceId(entry.addOnId);
  const nativeId = getReferenceId(entry.nativeId);
  if (!addOnId && !nativeId) {
    return null;
  }

  return {
    addOnId,
    nativeId,
    title: text(entry.title),
    description: text(entry.description),
    price: number(entry.price, 0),
    currency: text(entry.currency, SITE.CURRENCY).toUpperCase(),
    durationInMinutes: number(entry.durationInMinutes, 0),
    maxQuantity: number(entry.maxQuantity, 1),
    active: boolean(entry.active, true)
  };
}

function normalizeAddOns(data) {
  // Unica fuente admitida: DTO canonico del backend (reservas.web).
  const raw = Array.isArray(data.addOnOptions) ? data.addOnOptions : [];
  return raw
    .map(normalizeAddOn)
    .filter((addOn) => addOn && addOn.active === true)
    .slice(0, LIMITS.MAX_ADDONS_POR_RESERVA);
}

function normalizeService(data, params) {
  if (!data || typeof data !== "object") {
    throw new Error(PUBLIC_MESSAGE.SERVICE_LOAD_FAILED);
  }

  const serviceId = getReferenceId(data.serviceId);
  const slug = _safeSlugOrId(text(data.slug) || params.slug);

  if (!isGuid(serviceId)) {
    throw new Error(PUBLIC_MESSAGE.INVALID_SERVICE_IDENTITY);
  }
  if (!slug) {
    throw new Error(PUBLIC_MESSAGE.INVALID_SERVICE_IDENTITY);
  }

  // Visibilidad y vigencia canonicas: clientHidden + active + status.
  const clientHidden = boolean(data.clientHidden, false);
  const active = boolean(data.active, true);
  const status = text(data.status, CATALOG_STATUS.ACTIVO).toUpperCase();

  if (clientHidden || active === false || (status && status !== CATALOG_STATUS.ACTIVO)) {
    throw new Error(PUBLIC_MESSAGE.SERVICE_NOT_AVAILABLE);
  }

  // linkedPhases: REFERENCE con GUID Wix. Nunca se convierte a slug.
  const linkedPhaseId = getReferenceId(data.linkedPhases);
  const allowCombine = boolean(data.allowCombine, false) && isGuid(linkedPhaseId);

  const mainMedia = text(data.mainMedia);
  const addOns = normalizeAddOns(data);

  const phase1Duration = number(data.phase1Duration, 0);
  const phase2Duration = number(data.phase2Duration, 0);
  const exposureDuration = number(data.exposureDuration, 0);
  const declaredTotal = number(data.totalDuration, 0);
  const totalDuration = declaredTotal > 0 ? declaredTotal : phase1Duration + exposureDuration + phase2Duration;

  const service = {
    serviceId,
    slug,
    title: text(data.title),
    description: text(data.description),
    tagLine: text(data.tagLine),
    mainMedia,
    imageUrl: mainMedia,
    price: number(data.price, 0),
    currency: text(data.currency, SITE.CURRENCY).toUpperCase(),
    totalDuration,
    phase1Duration,
    phase2Duration,
    exposureDuration,
    durationRange: data.durationRange ?? null,
    allowCombine,
    phase2ServiceId: allowCombine ? linkedPhaseId : "",
    addOns,
    location: text(data.location),
    serviceType: text(data.serviceType),
    onlinePayment: boolean(data.onlinePayment, false),
    inPersonPayment: boolean(data.inPersonPayment, true),
    depositType: text(data.depositType),
    depositAmount: number(data.depositAmount, 0),
    pricingModel: text(data.pricingModel),
    referral: params.referral,
    preselectedAddOnIds: filterAllowedAddOnIds(addOns, params.addOnIds),
    timeZone: SITE.TIMEZONE,
    currencyCode: text(data.currency, SITE.CURRENCY).toUpperCase(),

    // MULTI_REFERENCE: IDs tecnicos sin transformar. availableStaff apunta a
    // Members (staffMemberId); la resolucion a resourceId de Bookings es
    // responsabilidad exclusiva del backend (booking/staffResolver).
    availableStaffIds: getReferenceIds(data.availableStaff),
    locationIds: getReferenceIds(data.locationId),

    metadata: {
      title: text(data.title),
      description: text(data.description),
      tagLine: text(data.tagLine),
      mainMedia,
      imageUrl: mainMedia,
      price: number(data.price, 0),
      currency: text(data.currency, SITE.CURRENCY).toUpperCase(),
      totalDuration,
      allowCombine,
      phase2ServiceId: allowCombine ? linkedPhaseId : "",
      addOns
    }
  };

  return projectPublicService(service);
}

function projectPublicService(service) {
  const projected = {};
  PUBLIC_SERVICE_FIELDS.forEach((field) => {
    if (service[field] !== undefined) {
      projected[field] = service[field];
    }
  });
  return Object.freeze(projected);
}

/* ============================================================================
 * 5. COMPLEMENTOS: filtrado estricto contra el catalogo del servicio
 * ==========================================================================*/

function filterAllowedAddOnIds(addOns, requestedIds) {
  if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
    return [];
  }
  if (!Array.isArray(addOns) || addOns.length === 0) {
    return [];
  }

  const allowed = new Set();
  addOns.forEach((addOn) => {
    const addOnId = text(addOn?.addOnId);
    const nativeId = text(addOn?.nativeId);
    if (addOnId) allowed.add(addOnId);
    if (nativeId) allowed.add(nativeId);
  });

  const filtered = requestedIds
    .map((value) => text(typeof value === "string" ? value : getReferenceId(value)))
    .filter((id) => id && allowed.has(id));

  return Array.from(new Set(filtered)).slice(0, LIMITS.MAX_ADDONS_POR_RESERVA);
}

/* ============================================================================
 * 6. CONTROLADOR DE PAGINA (estado encapsulado, cero globals dispersos)
 * ==========================================================================*/

function createCalendarController({ traceId, widget, params }) {
  const state = {
    traceId,
    widget,
    params,
    bridge: null,
    service: null,
    serviceId: "",
    slug: "",
    isBooking: false
  };

  function logWarn(message, details) {
    console.warn(`[calendario-2] ${message}`, { traceId: state.traceId, ...(details || {}) });
  }

  function logError(message, details) {
    console.error(`[calendario-2] ${message}`, { traceId: state.traceId, ...(details || {}) });
  }

  function getLookup() {
    // Identidad canonica de busqueda: GUID tecnico primero, slug publico despues.
    return state.serviceId || state.slug;
  }

  function reply(messageType, result, requestMessage) {
    if (!state.bridge || typeof state.bridge.reply !== "function") {
      logError("Bridge no disponible para responder", { messageType });
      return;
    }
    state.bridge.reply(messageType, result, requestMessage);
  }

  function requireService(messageType, requestMessage) {
    if (state.service) {
      return true;
    }
    reply(
      messageType,
      buildErrorResult(
        ERROR_CODE.SERVICE_CONTEXT_NOT_READY,
        PUBLIC_MESSAGE.SERVICE_CONTEXT_NOT_READY
      ),
      requestMessage
    );
    return false;
  }

  async function loadServiceContext() {
    const lookup = getLookup();
    if (!lookup) {
      throw new Error(PUBLIC_MESSAGE.INVALID_SERVICE_IDENTITY);
    }

    const result = await withTimeout(
      () => getServiceBySlugOrId(lookup),
      frontendTimeoutMs(),
      "getServiceBySlugOrId"
    );

    if (!isSuccessResult(result) || !result.data || typeof result.data !== "object") {
      const code = text(result?.error?.code, ERROR_CODE.SERVICE_LOAD_FAILED);
      logError("Carga de servicio rechazada", { code, lookup });
      throw new Error(text(result?.error?.message, PUBLIC_MESSAGE.SERVICE_LOAD_FAILED));
    }

    const service = normalizeService(result.data, state.params);
    state.service = service;
    state.serviceId = service.serviceId;
    state.slug = service.slug;

    auditServiceDurations(service, state.traceId);
    return service;
  }

  function handleNavigation(payload) {
    const target = text(payload?.target).toUpperCase();

    if (target === NAV_TARGET.SERVICIOS) {
      wixLocation.to(text(URLS?.SERVICIOS, DEFAULTS.SERVICES_URL));
      return;
    }
    if (target === NAV_TARGET.PRIVACY) {
      wixLocation.to(text(URLS?.PRIVACY_POLICY, DEFAULTS.PRIVACY_URL));
      return;
    }

    logWarn("Destino de navegacion no soportado", { target });
  }

  async function handleAvailability(payload, requestMessage) {
    if (!requireService(MESSAGE_TYPES.AVAIL, requestMessage)) {
      return;
    }

    const action = text(payload?.action).toLowerCase();
    const addOnIds = filterAllowedAddOnIds(state.service.addOns, payload?.addOnIds);
    const lookup = getLookup();
    const timeoutMs = frontendTimeoutMs();
    const resourceId = text(payload?.resourceId) || null;

    try {
      let result;

      if (action === AVAILABILITY_ACTION.DAYS) {
        const year = number(payload?.year, 0);
        const month = number(payload?.month, 0);
        if (year <= 0 || month <= 0) {
          reply(
            MESSAGE_TYPES.AVAIL,
            buildErrorResult(ERROR_CODE.INVALID_DATE, PUBLIC_MESSAGE.INVALID_DATE),
            requestMessage
          );
          return;
        }
        result = await withTimeout(
          () => getAvailableDays(lookup, resourceId, year, month, addOnIds),
          timeoutMs,
          "getAvailableDays"
        );
      } else if (action === AVAILABILITY_ACTION.SLOTS) {
        const dateYmd = text(payload?.dateYmd);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
          reply(
            MESSAGE_TYPES.AVAIL,
            buildErrorResult(ERROR_CODE.INVALID_DATE, PUBLIC_MESSAGE.INVALID_DATE),
            requestMessage
          );
          return;
        }
        const isDual = state.service.allowCombine === true;
        result = await withTimeout(
          () => (isDual
            ? getCertifiedDualSlots(lookup, resourceId, dateYmd, addOnIds)
            : getAvailableSlots(lookup, resourceId, dateYmd, addOnIds)),
          timeoutMs,
          isDual ? "getCertifiedDualSlots" : "getAvailableSlots"
        );
      } else {
        reply(
          MESSAGE_TYPES.AVAIL,
          buildErrorResult(
            ERROR_CODE.INVALID_AVAILABILITY_REQUEST,
            PUBLIC_MESSAGE.INVALID_AVAILABILITY_REQUEST
          ),
          requestMessage
        );
        return;
      }

      const normalized = normalizeWebResult(result, ERROR_CODE.EMPTY_AVAILABILITY_RESPONSE);
      reply(
        MESSAGE_TYPES.AVAIL,
        { ...normalized, requestSequence: number(payload?.requestSequence, 0) },
        requestMessage
      );
    } catch (error) {
      logError("Fallo consultando disponibilidad", { action, message: error?.message });
      reply(
        MESSAGE_TYPES.AVAIL,
        buildErrorResult(ERROR_CODE.AVAILABILITY_FAILED, PUBLIC_MESSAGE.AVAILABILITY_FAILED),
        requestMessage
      );
    }
  }

  async function handleSelection(payload, requestMessage) {
    if (!requireService(MESSAGE_TYPES.SELECT, requestMessage)) {
      return;
    }

    const slotF1 = payload?.slotF1 && typeof payload.slotF1 === "object" ? payload.slotF1 : payload;
    const start = text(payload?.localStartDate || slotF1?.localStartDate);
    const end = text(payload?.localEndDate || slotF1?.localEndDate);

    if (!isLocalDateTime(start) || !isLocalDateTime(end)) {
      reply(
        MESSAGE_TYPES.SELECT,
        buildErrorResult(ERROR_CODE.INVALID_SLOT, PUBLIC_MESSAGE.INVALID_SLOT),
        requestMessage
      );
      return;
    }

    const duration = diffMinutes(start, end);
    if (duration === null || duration <= 0) {
      reply(
        MESSAGE_TYPES.SELECT,
        buildErrorResult(ERROR_CODE.INVALID_SLOT, PUBLIC_MESSAGE.INVALID_SLOT),
        requestMessage
      );
      return;
    }

    const addOnIds = filterAllowedAddOnIds(state.service.addOns, payload?.addOnIds);
    const resourceId = text(payload?.resourceId) || null;

    try {
      const result = await withTimeout(
        () => resolveStaffForSlot(getLookup(), start, resourceId, addOnIds, end),
        frontendTimeoutMs(),
        "resolveStaffForSlot"
      );
      reply(
        MESSAGE_TYPES.SELECT,
        normalizeWebResult(result, ERROR_CODE.STAFF_RESOLVE_FAILED),
        requestMessage
      );
    } catch (error) {
      logError("Fallo validando profesional", { message: error?.message });
      reply(
        MESSAGE_TYPES.SELECT,
        buildErrorResult(ERROR_CODE.STAFF_RESOLVE_FAILED, PUBLIC_MESSAGE.STAFF_RESOLVE_FAILED),
        requestMessage
      );
    }
  }

  function buildBookingRequest(bookingData) {
    const addOnIds = filterAllowedAddOnIds(state.service.addOns, bookingData.addOnIds);
    const clientRequestId = createClientRequestId(state.traceId);

    return {
      serviceId: state.service.serviceId,
      slug: state.service.slug,
      phase2ServiceId: state.service.phase2ServiceId,
      allowCombine: state.service.allowCombine,
      slotF1: bookingData.slotF1 ?? null,
      slotF2: state.service.allowCombine ? bookingData.slotF2 ?? null : null,
      localStartDate: text(bookingData.localStartDate || bookingData.slotF1?.localStartDate),
      localEndDate: text(bookingData.localEndDate || bookingData.slotF1?.localEndDate),
      resourceId: text(bookingData.resourceId) || null,
      addOnIds,
      paymentMethod: text(bookingData.paymentMethod, PAYMENT_METHOD.ONLINE).toUpperCase(),
      contactDetails: bookingData.contactDetails ?? null,
      referral: text(bookingData.referral, state.service.referral || DEFAULTS.CALENDAR_REFERRAL),
      timeZone: SITE.TIMEZONE,
      currency: state.service.currency,
      clientRequestId,
      traceId: state.traceId
    };
  }

  async function openConfirmation(data) {
    try {
      await wixWindow.openLightbox(DEFAULTS.CONFIRMATION_LIGHTBOX, data ?? null);
    } catch (error) {
      logError("No se pudo abrir el lightbox de confirmacion", { message: error?.message });
    }
  }

  async function handleBooking(message) {
    if (!requireService(MESSAGE_TYPES.BOOK, message)) {
      return;
    }

    if (state.isBooking) {
      reply(
        MESSAGE_TYPES.BOOK,
        buildErrorResult(ERROR_CODE.BOOKING_IN_PROGRESS, PUBLIC_MESSAGE.BOOKING_IN_PROGRESS),
        message
      );
      return;
    }

    const payload = getPayload(message);
    const bookingData = payload.bookingData;

    if (!bookingData || typeof bookingData !== "object" || Array.isArray(bookingData)) {
      reply(
        MESSAGE_TYPES.BOOK,
        buildErrorResult(ERROR_CODE.INVALID_BOOKING_PAYLOAD, PUBLIC_MESSAGE.INVALID_BOOKING_PAYLOAD),
        message
      );
      return;
    }

    if (state.service.allowCombine) {
      const dualCheck = validateDualSlots(bookingData.slotF1, bookingData.slotF2);
      if (!dualCheck.ok) {
        reply(
          MESSAGE_TYPES.BOOK,
          buildErrorResult(dualCheck.code, PUBLIC_MESSAGE[dualCheck.code]),
          message
        );
        return;
      }
    } else {
      const start = text(bookingData.localStartDate || bookingData.slotF1?.localStartDate);
      const end = text(bookingData.localEndDate || bookingData.slotF1?.localEndDate);
      if (!isLocalDateTime(start) || !isLocalDateTime(end) || (diffMinutes(start, end) ?? 0) <= 0) {
        reply(
          MESSAGE_TYPES.BOOK,
          buildErrorResult(ERROR_CODE.INVALID_SLOT, PUBLIC_MESSAGE.INVALID_SLOT),
          message
        );
        return;
      }
    }

    const request = buildBookingRequest(bookingData);
    state.isBooking = true;

    try {
      const result = await withTimeout(
        () => processDualBooking(request),
        frontendTimeoutMs(),
        "processDualBooking"
      );

      const normalized = normalizeWebResult(result, ERROR_CODE.EMPTY_BOOKING_RESPONSE);
      reply(MESSAGE_TYPES.BOOK, normalized, message);

      if (isSuccessResult(normalized)) {
        await openConfirmation(normalized.data);
      } else {
        logWarn("Reserva rechazada por backend", {
          code: normalized.error?.code,
          clientRequestId: request.clientRequestId
        });
      }
    } catch (error) {
      logError("Fallo completando reserva", {
        message: error?.message,
        clientRequestId: request.clientRequestId
      });
      reply(
        MESSAGE_TYPES.BOOK,
        buildErrorResult(ERROR_CODE.BOOKING_FAILED, PUBLIC_MESSAGE.BOOKING_FAILED),
        message
      );
    } finally {
      state.isBooking = false;
    }
  }

  async function handleWidgetMessage(message, widgetBridge) {
    state.bridge = widgetBridge || state.bridge;

    const type = getMessageType(message);
    const payload = getPayload(message);

    switch (type) {
      case MESSAGE_TYPES.NAV:
        handleNavigation(payload);
        return;
      case MESSAGE_TYPES.AVAIL:
        await handleAvailability(payload, message);
        return;
      case MESSAGE_TYPES.SELECT:
        await handleSelection(payload, message);
        return;
      case MESSAGE_TYPES.BOOK:
        await handleBooking(message);
        return;
      case MESSAGE_TYPES.READY:
      case MESSAGE_TYPES.CONTEXT:
        return;
      default:
        logWarn("Mensaje no soportado", { type });
    }
  }

  function init() {
    state.bridge = createWidgetBridge(state.widget, {
      onContextReady: () => loadServiceContext(),
      onWidgetMessage: (message, widgetBridge) => handleWidgetMessage(message, widgetBridge),
      onError: (error) => {
        logError("Error de comunicacion con el widget", { message: error?.message });
        reply(
          MESSAGE_TYPES.CONTEXT,
          buildErrorResult(ERROR_CODE.SERVICE_NOT_AVAILABLE, PUBLIC_MESSAGE.SERVICE_NOT_AVAILABLE),
          null
        );
      }
    });

    if (!state.bridge) {
      throw new Error(PUBLIC_MESSAGE.WIDGET_UNAVAILABLE);
    }

    return state.bridge;
  }

  return Object.freeze({
    init,
    get service() {
      return state.service;
    },
    get traceId() {
      return state.traceId;
    }
  });
}

/* ============================================================================
 * 7. PARAMETROS DE URL (solo claves canonicas)
 * ==========================================================================*/

function parseUrlParams() {
  const query = wixLocation.query || {};

  return Object.freeze({
    serviceId: text(query.serviceId),
    slug: _safeSlugOrId(text(query.slug)),
    referral: text(query.referral),
    // Clave canonica: addOnIds (ComplementosCatalogo.addOnId).
    addOnIds: text(query.addOnIds)
      .split(",")
      .map((value) => _safeTrim(value))
      .filter(Boolean)
      .slice(0, LIMITS.MAX_ADDONS_POR_RESERVA)
  });
}

function resolveServiceIdentity(params) {
  const serviceId = text(params.serviceId);
  const slug = _safeSlugOrId(params.slug);

  if (serviceId && isGuid(serviceId)) {
    return { serviceId, slug };
  }
  if (slug) {
    return { serviceId: "", slug };
  }
  return null;
}

/* ============================================================================
 * 8. PROTOCOLO DE MENSAJES DEL WIDGET
 * ==========================================================================*/

function getMessageType(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  return text(message.type || message.action).toUpperCase();
}

function getPayload(message) {
  if (
    !message ||
    typeof message !== "object" ||
    !message.payload ||
    typeof message.payload !== "object" ||
    Array.isArray(message.payload)
  ) {
    return {};
  }
  return message.payload;
}

/* ============================================================================
 * 9. ARRANQUE
 * ==========================================================================*/

let controller = null;

$w.onReady(() => {
  const traceId = makeTraceId("calendario");
  const params = parseUrlParams();
  const identity = resolveServiceIdentity(params);

  if (!identity) {
    console.error("[calendario-2] Identidad de servicio invalida", { traceId, params });
    return;
  }

  let widget;
  try {
    widget = $w(DEFAULTS.WIDGET_ID);
  } catch (error) {
    console.error("[calendario-2] Widget HTML no accesible", { traceId, message: error?.message });
    return;
  }

  if (
    !widget ||
    typeof widget.postMessage !== "function" ||
    typeof widget.onMessage !== "function"
  ) {
    console.error("[calendario-2] Widget HTML no disponible", { traceId });
    return;
  }

  try {
    controller = createCalendarController({
      traceId,
      widget,
      params: { ...params, serviceId: identity.serviceId, slug: identity.slug }
    });
    controller.init();
  } catch (error) {
    console.error("[calendario-2] Error de inicializacion", {
      traceId,
      code: ERROR_CODE.BRIDGE_INIT_FAILED,
      message: error?.message
    });
  }
});
