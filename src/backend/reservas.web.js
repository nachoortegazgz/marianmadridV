/* ============================================================================
 * FILE: backend/reservas.web.js
 * VERSION: v5009-FISCAL-V20.8-PROD-FIXED
 * BASE: v5009-FISCAL-V20.7-PROD + Auditoria de alineacion SSOT ServiciosCatalogo
 * RESPONSABILITY: Availability engine, dual slots, staff pairing and caching.
 * STANDARDS: G10 ASCII Strict.
 *
 * ALINEACION SSOT (BIBLIA v5009-V20-FINAL-CONSOLIDATED-v4, apartado 4.3):
 *  - FIX-01 Identidad publica unica: slug. Se retira slug del contrato.
 *  - FIX-02 Normalizacion segura del slug (query, hash, barras, ultimo segmento).
 *  - FIX-03 Consulta separada: GUID -> serviceId / slug -> slug.
 *  - FIX-04 Se retira el fallback GUID imposible dentro de la rama no-GUID.
 *  - FIX-05 El mapper devuelve slug como identidad canonica.
 *  - FIX-06 Cache con claves validas: slug y serviceId.
 *  - FIX-07 Contrato frontend/backend alineado (raiz + metadata).
 *  - FIX-08 price y currency expuestos en raiz y en metadata.
 *  - FIX-09 title, description, tagLine expuestos en raiz.
 *  - FIX-10 mainMedia e mainMedia expuestos de forma compatible.
 *  - FIX-11 Complementos normalizados desde addOnOptions (campo canonico 4.3).
 *  - FIX-12 linkedPhases sigue siendo GUID de Bookings (no se convierte a slug).
 *  - FIX-13 SERVICELOCATIONMISMATCH preservado como error estructurado.
 *  - FIX-14 Lectura consistente del CMS (consistentRead: true).
 *  - FIX-15 Trazabilidad mejorada: el log incluye lookupField.
 *
 *  - H-02 Gate de vigencia: active y status validados con codigo propio.
 *  - H-03 Visibilidad canonica: clientHidden (lectura tolerante documentada).
 *  - H-04 Fiscal: tipoImpositivo + codigoImpuesto. Se retira taxRate.
 *  - H-05 Se retira el campo inexistente buffer del contrato del modulo.
 *  - H-06 totalDuration canonico: suma exacta de fases en duales, sin
 *         reemplazo silencioso del valor maestro ni fallback a 30.
 *  - H-07 Cero tolerancia de doble nombre: linkFases y staffDisponible
 *         dejan de consumirse como alias de lectura.
 *  - H-09 itemNature consumido como gate de reservabilidad.
 *  - H-10 linkedPhases es Text (GUID unico) segun 4.3; el DTO lo expone tal cual.
 *  - B-01 Frontera Wix: bookingStatus de CitasF2 y el estado oficial de
 *         Bookings se normalizan con un adaptador unico.
 * ============================================================================
 */

import { webMethod, Permissions } from "wix-web-module";
// EXCEPCION DATA API (APENDICE C de la BIBLIA): consultas CMS server-side
// con suppressAuth/consistentRead; no migrables a queryDataItems (ver apendice).
import wixData from "wix-data";
import { bookings } from "@wix/bookings";
import { elevate } from "wix-auth";
import { availabilityTimeSlots } from "@wix/bookings";

import {
  COLLECTIONS,
  SDK_CONFIG,
  SLOT_SEARCH,
  API,
  STAFFDEFAULTNAME,
  BOOKING_STATUS
} from "backend/internalConfig";

import {
  makeTraceId,
  _safeTrim,
  _looksLikeGuid,
  _normalizeLocalIsoStr,
  getUtcDateFromMadridLocal,
  _executeWithRetry,
  withTimeout
} from "public/mmUtils";

import {
  cleanGuidList,
  readDurationRange,
  resolveExpectedSlotMinutes,
  resolveLinkedPhase2Duration,
  toUtcRange,
  pickStaffByLowestLoad,
  // v5010.4 (FASE 2): helpers canonicos de slot unificados en bookingUtils
  normalizeSlotShape as _normalizeSlotShape,
  getResourceIdsFromSlot as _getResourceIdsFromSlot
} from "backend/booking/bookingUtils";

import {
  // v5010.4 (FASE 2): token determinista expuesto por bookingCore sobre la
  // huella unica de bookingUtils._buildPairFingerprint. Sin duplicacion ni
  // ciclos de import.
  _buildPairTokenDeterministic
} from "backend/booking/bookingCore";

import { logger } from "backend/logger";
import { getStaffDisplayName } from "backend/staff";

const log = logger;

// ============================================================================
// CODIGOS DE ERROR CANONICOS DEL MODULO
// ============================================================================

const ERROR_CODES = Object.freeze({
  SERVICENOTFOUND: "SERVICENOTFOUND",
  SERVICENOTACTIVE: "SERVICENOTACTIVE",
  SERVICEHIDDEN: "SERVICEHIDDEN",
  SERVICEITEMNATUREINVALID: "SERVICEITEMNATUREINVALID",
  SERVICELOCATIONMISMATCH: "SERVICELOCATIONMISMATCH",
  ERRDUAL01: "ERRDUAL01",
  ERRDUALMATH: "ERRDUALMATH",
  ERRTAX01: "ERRTAX01",
  SERVICEISDUAL: "SERVICEISDUAL",
  SERVICENOTDUAL: "SERVICENOTDUAL",
  INVALIDDATE: "INVALIDDATE",
  INVALIDPAYLOAD: "INVALIDPAYLOAD",
  INVALIDSLOTRECHECK: "INVALIDSLOTRECHECK",
  DURATIONRANGEWITHADDONSNOTSUPPORTED: "DURATIONRANGEWITHADDONSNOTSUPPORTED",
  SLOTUNAVAILABLE: "SLOTUNAVAILABLE",
  SLOTDURATIONMISMATCH: "SLOTDURATIONMISMATCH",
  SLOTDURATIONOUTOFRANGE: "SLOTDURATIONOUTOFRANGE",
  STAFFUNAVAILABLE: "STAFFUNAVAILABLE",
  LOCATIONMISMATCH: "LOCATIONMISMATCH",
  AVAILABLESLOTSFAILED: "AVAILABLESLOTSFAILED",
  AVAILABLEDAYSFAILED: "AVAILABLEDAYSFAILED",
  DUALSLOTSFAILED: "DUALSLOTSFAILED",
  STAFFRESOLVEFAILED: "STAFFRESOLVEFAILED",
  SERVICELOOKUPFAILED: "SERVICELOOKUPFAILED",
  SERVICERESOLVEFAILED: "SERVICERESOLVEFAILED",
  BOOKINGNOTDISPLAYABLE: "BOOKINGNOTDISPLAYABLE",
  BOOKINGLOOKUPFAILED: "BOOKINGLOOKUPFAILED",
  DATABASEERROR: "DATABASEERROR",
  INTERNALERROR: "INTERNALERROR"
});

// ============================================================================
// CONSTANTES DE MODULO
// ============================================================================

const SERVICIOSCOL = COLLECTIONS.SERVICIOSCATALOGO;
const WATCHDOGTIMEOUTMS = SDKCONFIG.TIMEOUTS.WATCHDOGMS;
const SERVICECACHETTLMS = SDKCONFIG.CACHE.SERVICESTTLMS;
// v5010.4 (FASE 2): clave V20 segun BIBLIA 3.2.1 fila 13.
const MINUTOSMAXHUECO_DUAL = Math.max(
  0,
  Number(SLOTSEARCH?.MINUTOSMAXHUECODUAL) || 120
);
const CACHEMAXSIZE = SDKCONFIG.CACHE.MAXENTRIES;
const STAFFRESOURCETYPEID = API.STAFFRESOURCETYPEID;
const STAFFLOADQUERY_LIMIT = Math.max(
  100,
  Number(SDKCONFIG?.JOBS?.HEALTHCHECKQUERYLIMIT) || 1000
);

// Naturaleza reservable segun 4.3 fila 26.
const ITEMNATURESERVICE = "SERVICIO_PROPIO";
// Estado reservable segun 4.3 fila 39 y 3.2 CATALOG_CONFIG.STATES.
const CATALOGSTATUSACTIVE = "ACTIVO";

const LOCATIONID = safeTrim(SDKCONFIG?.LOCATIONID);
if (!LOCATIONID || !looksLikeGuid(LOCATION_ID)) {
  throw new Error("Configured booking location is invalid.");
}

const LOCATION_TS = Object.freeze({
  id: LOCATION_ID,
  locationType: "BUSINESS"
});

const LOCATION_BOOKING = Object.freeze({
  id: LOCATION_ID,
  locationType: "OWNER_BUSINESS"
});

const serviceCatalogRAM = new Map();

// ============================================================================
// HELPERS INTERNOS GENERICOS
// ============================================================================

function _readImport2Field(item, field) {
  if (!item || typeof item !== "object") return null;
  return item[field] ?? item.data?.[field] ?? item.fields?.[field] ?? null;
}

function _readBooleanField(item, field) {
  const value = _readImport2Field(item, field);
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function _readNumberField(item, field) {
  const value = Number(_readImport2Field(item, field));
  return Number.isFinite(value) ? value : 0;
}

function _toError(code, message, extra) {
  const error = new Error(String(message || code));
  error.code = String(code);
  if (extra && typeof extra === "object") {
    Object.assign(error, extra);
  }
  return error;
}

/* Constructor canonico de respuesta de error estructurada.
 */
function _structuredError(code, message, traceId, extra) {
  return {
    status: "ERROR",
    data: null,
    error: {
      code: String(code),
      message: String(message),
      ...(traceId ? { traceId: String(traceId) } : {}),
      ...(extra && typeof extra === "object" ? extra : {})
    }
  };
}

/* FIX-01 / FIX-02: identidad publica unica slug.
 * Normalizacion segura: sin query, sin hash, sin barras, ultimo segmento,
 * en minusculas. Los GUID no se transforman.
 */
function _normalizeSlugInput(raw) {
  const value = _safeTrim(raw);
  if (!value) return "";

  const withoutQuery = String(value).split("?")[0].split("#")[0];
  const withoutSlashes = withoutQuery.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!withoutSlashes) return "";

  const lastSegment = withoutSlashes.includes("/")
    ? withoutSlashes.split("/").filter(Boolean).pop()
    : withoutSlashes;

  return String(lastSegment || "").trim().toLowerCase();
}

function _cacheSetBounded(map, key, value, maxSize) {
  const safeKey = _safeTrim(key);
  if (!safeKey) return;
  if (map.has(safeKey)) map.delete(safeKey);
  map.set(safeKey, value);
  if (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

function _toPublicError(err, fallbackCode, fallbackMessage) {
  return {
    code: String(err?.code || fallbackCode || ERRORCODES.INTERNALERROR),
    message: String(err?.message || fallbackMessage || "Internal Error")
  };
}

function _attachServiceId(slot, forcedServiceId, traceId, ctx) {
  const normalizedSlot = _normalizeSlotShape(slot);
  if (!normalizedSlot) return null;

  const serviceId = _safeTrim(forcedServiceId);
  if (!serviceId || !_looksLikeGuid(serviceId)) {
    log.error("_attachServiceId: invalid serviceId", { traceId, ctx, serviceId });
    return null;
  }

  return {
    ...normalizedSlot,
    serviceId,
    ...(normalizedSlot.slot && typeof normalizedSlot.slot === "object"
      ? { slot: { ...normalizedSlot.slot, serviceId } }
      : {})
  };
}

function _isValidMadridYmd(value) {
  const ymd = _safeTrim(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function _normalizeResourceIds(resourceId, traceId) {
  if (!resourceId) return [];

  const normalized = _safeTrim(resourceId);
  if (!normalized || ["all", "any"].includes(normalized.toLowerCase())) return [];

  if (_looksLikeGuid(normalized)) return [normalized];

  log.warn("_normalizeResourceIds: invalid resource identifier", {
    resourceId: normalized,
    traceId
  });
  return [];
}

function _minutesBetweenUtcDates(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return 0;
  const milliseconds = b.getTime() - a.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds  startUtc.getTime());
}

async function _getStaffDisplayNamePublic(resourceId) {
  const id = _safeTrim(resourceId);
  if (!id || !looksLikeGuid(id)) return STAFFDEFAULT_NAME;
  try {
    const name = await getStaffDisplayName(id);
    return safeTrim(name) || STAFFDEFAULT_NAME;
  } catch (_) {
    return STAFFDEFAULTNAME;
  }
}

/* B-01 FRONTERA WIX: adaptador unico de estado oficial Bookings -> enum interno.
 * Los enums internos se persisten en espanol MAYUSCULAS (BIBLIA 3.2 / D10).
 */
function _mapWixBookingStatusToInternal(status) {
  const normalized = String(status || "").trim().toUpperCase();

  switch (normalized) {
    case "CONFIRMED":
    case "CONFIRMADO":
      return String(BOOKING_STATUS?.CONFIRMADO || "CONFIRMADO");
    case "PENDING":
    case "PENDING_APPROVAL":
    case "PENDING_PAYMENT":
    case "PENDIENTE_PAGO":
      return String(BOOKINGSTATUS?.PENDIENTEPAGO || "PENDIENTE_PAGO");
    case "CANCELED":
    case "CANCELLED":
    case "CANCELADO":
      return String(BOOKING_STATUS?.CANCELADO || "CANCELADO");
    case "REFUNDED":
    case "REEMBOLSADO":
      return String(BOOKING_STATUS?.REEMBOLSADO || "REEMBOLSADO");
    default:
      return null;
  }
}

// ============================================================================
// HELPERS DE COMPLEMENTOS (addOnOptions, campo canonico 4.3 fila 19)
// La coleccion declara addOnOptions como Array. Cada elemento puede ser un
// objeto o un string JSON serializado; se normaliza de forma segura.
// ============================================================================

function _parseImport2Addons(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (item && typeof item === "object") {
      return [item];
    }

    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === "object" ? [parsed] : [];
      } catch (_) {
        return [];
      }
    }

    return [];
  });
}

function _normalizeImport2Addon(addon) {
  if (!addon || typeof addon !== "object") return null;
  return {
    ...addon,
    id: safeTrim(addon.id || addon.id || addon.addOnId),
    nombre: _safeTrim(addon.nombre || addon.name || addon.title),
    precio: Number(addon.precio ?? addon.price ?? 0) || 0
  };
}

function _readCanonicalAddons(service) {
  return parseImport2Addons(readImport2Field(service, "addOnOptions"))
    .map(_normalizeImport2Addon)
    .filter(Boolean);
}

function _getRequestedAddonContext(service, requestedAddonIds) {
  const requested = new Set(
    (Array.isArray(requestedAddonIds) ? requestedAddonIds : [])
      .map((id) => _safeTrim(id))
      .filter(Boolean)
  );

  const addons = Array.isArray(service?.addOnOptions) ? service.addOnOptions : [];

  const selected = addons.filter((addon) => {
    const id = _safeTrim(addon?.id);
    const nativeId = _safeTrim(addon?.nativeId);
    return requested.has(id) || requested.has(nativeId);
  });

  return {
    nativeAddonIds: Array.from(
      new Set(
        selected
          .map((addon) => _safeTrim(addon?.nativeId || addon?.id))
          .filter((id) => _looksLikeGuid(id))
      )
    ),
    addons: selected
  };
}

function _resolveAddonContextInternal(service, requestedAddonIds) {
  return _getRequestedAddonContext(service, requestedAddonIds);
}

// ============================================================================
// HELPER DE VISIBILIDAD (H-03)
// Campo canonico segun Anexo B.1/B.2 y reglas duales: clientHidden.
// Lectura tolerante documentada: la tabla 4.3 registra la variante
// hiddenClient; se acepta solo en lectura para no romper datos importados.
// El DTO de salida expone exclusivamente clientHidden.
// ============================================================================

function _readClientHidden(service) {
  if (_readBooleanField(service, "clientHidden")) return true;
  if (_readBooleanField(service, "hiddenClient")) return true;
  return false;
}

// ============================================================================
// PATCH-08: Validacion de recursos en getAvailabilityTimeSlot
// ============================================================================

async function _verifyRequiredStaffViaGet({
  serviceId,
  start,
  end,
  requiredResourceId,
  nativeAddonIds,
  traceId
}) {
  const getPayload = {
    serviceId: String(serviceId),
    localStartDate: start,
    localEndDate: end,
    location: LOCATION_TS,
    timeZone: SDK_CONFIG.TZ,
    resourceTypes: [
      { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: [requiredResourceId] }
    ]
  };

  if (Array.isArray(nativeAddonIds) && nativeAddonIds.length > 0) {
    getPayload.customerChoices = { addOnIds: nativeAddonIds };
  }

  try {
    const result = await _executeWithRetry(
      () =>
        withTimeout(
          () => availabilityTimeSlots.getAvailabilityTimeSlot(getPayload),
          WATCHDOGTIMEOUTMS,
          "exactSlot:verifyStaffGet"
        ),
      2,
      300
    );

    if (result?.timeSlot) {
      const slot = result.timeSlot;
      const resourceIds = getResourceIdsFromSlot(slot, STAFFRESOURCETYPEID);

      if (slot?.bookable === true && resourceIds.includes(requiredResourceId)) {
        return { ok: true, slot: slot, errorCode: null };
      }

      return { ok: false, slot: null, errorCode: "STAFF_UNAVAILABLE" };
    }

    return { ok: false, slot: null, errorCode: "STAFF_UNAVAILABLE" };
  } catch (error) {
    log.warn("getAvailabilityTimeSlot verification failed", {
      traceId,
      serviceId: String(serviceId),
      requiredResourceId,
      message: error?.message
    });
    return { ok: false, slot: null, errorCode: "STAFF_UNAVAILABLE" };
  }
}

// ============================================================================
// SERVICE CATALOG — MAPPER CANONICO ALINEADO CON ServiciosCatalogo (4.3)
// ============================================================================

export async function _mapServiceImport2ToUX(service, traceId) {
  // --- Identidades Wix (R19: se preservan) ---------------------------------
  const serviceId = safeTrim(readImport2Field(service, "serviceId"));
  const slug = safeTrim(readImport2Field(service, "slug")) || null;
  const title = safeTrim(readImport2Field(service, "title")) || "Service";
  const serviceType = safeTrim(readImport2Field(service, "serviceType")) || null;
  const allowCombineRaw = _readBooleanField(service, "allowCombine");
  const locationId = safeTrim(readImport2Field(service, "locationId")) || null;

  // --- Validaciones de contrato --------------------------------------------
  if (!_looksLikeGuid(serviceId)) {
    throw _toError(
      ERRORCODES.INTERNALERROR,
      "Catalog serviceId is missing or invalid."
    );
  }

  if (
    locationId &&
    _looksLikeGuid(locationId) &&
    locationId !== LOCATION_ID
  ) {
    // FIX-13: se captura arriba y se devuelve como SERVICELOCATIONMISMATCH.
    throw _toError(
      ERRORCODES.SERVICELOCATION_MISMATCH,
      "Service location does not match configured location."
    );
  }

  // --- Visibilidad y dualidad (H-03, H-10, FIX-12) -------------------------
  const clientHidden = _readClientHidden(service);
  const linkedPhases = safeTrim(readImport2Field(service, "linkedPhases")) || null;
  const allowCombine = !clientHidden && allowCombineRaw === true;

  if (allowCombine && !_looksLikeGuid(linkedPhases)) {
    throw _toError(
      ERRORCODES.ERRDUAL_01,
      "Dual service linkedPhases is missing or invalid."
    );
  }

  if (allowCombine && linkedPhases === serviceId) {
    throw _toError(
      ERRORCODES.ERRDUAL_01,
      "A service cannot link to itself (linkedPhases === serviceId)."
    );
  }

  // --- Duraciones (4.3 filas 13-17) ----------------------------------------
  const phase1Duration = _readNumberField(service, "phase1Duration");
  const exposureDuration = _readNumberField(service, "exposureDuration");
  let phase2Duration = _readNumberField(service, "phase2Duration");

  if (allowCombine && _looksLikeGuid(linkedPhases)) {
    const visited = new Set([serviceId]);
    const resolved = await resolveLinkedPhase2Duration(
      linkedPhases,
      traceId,
      visited,
      _getServiceBySlugOrIdInternal
    );
    if (resolved > 0) phase2Duration = resolved;
  }

  const totalDurationRaw = _readNumberField(service, "totalDuration");
  const durationRange = readDurationRange(service);
  const sumaFases = phase1Duration + exposureDuration + phase2Duration;

  // H-06: regla aritmetica obligatoria en duales. Sin fallback silencioso.
  if (allowCombine && Math.abs(sumaFases - totalDurationRaw) > 0.1) {
    log.error("ERRDUALMATH: phase sum does not match totalDuration", {
      traceId,
      serviceId,
      slug,
      phase1Duration,
      exposureDuration,
      phase2Duration,
      sumaFases,
      totalDurationRaw
    });
    throw _toError(
      ERRORCODES.ERRDUAL_MATH,
      Phase sum (${sumaFases}) does not match totalDuration (${totalDurationRaw}).
    );
  }

  const totalDuration =
    totalDurationRaw > 0
      ? totalDurationRaw
      : allowCombine
        ? sumaFases
        : phase1Duration;

  if (!(totalDuration > 0)) {
    log.warn("Service without usable duration", { traceId, serviceId, slug });
  }

  // --- Naturaleza y estado (H-09, H-02) ------------------------------------
  const itemNature = safeTrim(readImport2Field(service, "itemNature")) || null;
  const status = String(safeTrim(readImport2Field(service, "status")) || "").toUpperCase() || null;
  const active = _readBooleanField(service, "active");

  if (itemNature && itemNature !== ITEMNATURESERVICE) {
    throw _toError(
      ERRORCODES.SERVICEITEMNATUREINVALID,
      Catalog item is not a bookable service (itemNature=${itemNature}).
    );
  }

  // --- Fiscal (H-04) --------------------------------------------------------
  const taxIncluded = _readBooleanField(service, "taxIncluded");
  const tipoImpositivo = _readNumberField(service, "tipoImpositivo");
  const codigoImpuesto = safeTrim(readImport2Field(service, "codigoImpuesto")) || null;
  const claveRegimen = safeTrim(readImport2Field(service, "claveRegimen")) || null;
  const calificacionOperacion =
    safeTrim(readImport2Field(service, "calificacionOperacion")) || null;
  const operacionExenta = safeTrim(readImport2Field(service, "operacionExenta")) || null;
  const inversionSujetoPasivo = _readBooleanField(service, "inversionSujetoPasivo");
  const cuentaContableIngreso =
    safeTrim(readImport2Field(service, "cuentaContableIngreso")) || null;

  if (tipoImpositivo > 0 && !codigoImpuesto) {
    log.warn("ERRTAX01: tipoImpositivo without codigoImpuesto", {
      traceId,
      serviceId,
      slug,
      tipoImpositivo
    });
  }

  // --- Comerciales y de presentacion ---------------------------------------
  const price = _readNumberField(service, "price");
  const currency = safeTrim(readImport2Field(service, "currency")) || "EUR";
  const sku = safeTrim(readImport2Field(service, "sku")) || null;
  const pricingModel = safeTrim(readImport2Field(service, "pricingModel")) || null;
  const depositAmount = _readNumberField(service, "depositAmount");
  const depositType = safeTrim(readImport2Field(service, "depositType")) || null;
  const onlinePayment = _readBooleanField(service, "onlinePayment");
  const inPersonPayment = _readBooleanField(service, "inPersonPayment");
  const margin = _readNumberField(service, "margin");
  const location = safeTrim(readImport2Field(service, "location")) || null;
  const description = safeTrim(readImport2Field(service, "description")) || null;
  const tagLine = safeTrim(readImport2Field(service, "tagLine")) || null;
  const categoryId = safeTrim(readImport2Field(service, "categoryId")) || null;
  const category = safeTrim(readImport2Field(service, "category")) || null;
  const mainMedia = safeTrim(readImport2Field(service, "mainMedia")) || "";
  const internalNotes = safeTrim(readImport2Field(service, "internalNotes")) || null;

  // --- Staff disponible (4.3 fila 18) --------------------------------------
  const availableStaff = cleanGuidList(_readImport2Field(service, "availableStaff"));

  const staffOptions = await Promise.all(
    availableStaff.map(async (resourceId) => {
      const displayName = await _getStaffDisplayNamePublic(resourceId);
      return {
        id: resourceId,
        value: resourceId,
        name: displayName,
        label: displayName
      };
    })
  );

  // --- Complementos (FIX-11) ------------------------------------------------
  const addOnOptions = _readCanonicalAddons(service);

  // --- DTO canonico ---------------------------------------------------------
  return {
    // Identidades Wix preservadas (R19)
    serviceId,
    slug,
    title,
    serviceType,
    locationId,
    contactLocation: LOCATION_BOOKING,

    // Comerciales
    price,
    currency,
    sku,
    margin,
    pricingModel,
    depositAmount,
    depositType,
    onlinePayment,
    inPersonPayment,

    // Dualidad
    allowCombine,
    linkedPhases: allowCombine ? linkedPhases : null,
    phase1Duration,
    exposureDuration,
    phase2Duration,
    totalDuration,
    durationRange,

    // Visibilidad y vigencia
    clientHidden,
    active,
    status,
    itemNature,

    // Fiscal
    taxIncluded,
    tipoImpositivo,
    codigoImpuesto,
    claveRegimen,
    calificacionOperacion,
    operacionExenta,
    inversionSujetoPasivo,
    cuentaContableIngreso,

    // Presentacion
    description,
    tagLine,
    categoryId,
    category,
    location,
    mainMedia,
    mainMedia: mainMedia,
    addOnOptions,

    // H-07: fuente unica availableStaff (4.3 fila 18).
    availableStaff,
    staffOptions,

    // Notas internas: solo consumo backend; _toPublicService las retira.
    internalNotes,

    metadata: {
      titulo: title,
      tituloServicio: title,
      descripcion: description,
      descripcionLarga: description,
      resumenCorto: tagLine,
      precio: price,
      currency,
      moneda: currency,
      duracionTotal: totalDuration,
      localizacion: location,
      location,
      permitirCombinar: allowCombine,
      fasesEnlazadas: allowCombine ? linkedPhases : null,
      tiempoFase1: phase1Duration,
      tiempoExposicion: exposureDuration,
      tiempoFase2: phase2Duration,
      disponibleStaff: availableStaff,
      ocultoCliente: clientHidden,
      impuestoIncluido: taxIncluded,
      tipoImpositivo,
      codigoImpuesto,
      claveRegimen,
      calificacionOperacion,
      itemNaturaleza: itemNature,
      estado: status,
      addons: addOnOptions,
      addonsPrecio: addOnOptions.map((addon) => Number(addon?.precio || 0)),
      mainMedia: mainMedia,
      mainMedia,
      pricingModel,
      pricing: { base: price, currency },
      timing: { totalDuration, sumaFases },
      durationRange
    }
  };
}

// ============================================================================
// SERVICE CATALOG — RESOLUCION POR serviceId O slug
// ============================================================================

export async function _getServiceBySlugOrIdInternal(slugOrId, externalTraceId) {
  const traceId = externalTraceId || makeTraceId("service");
  const raw = _safeTrim(slugOrId);
  const isGuid = _looksLikeGuid(raw);

  // FIX-02: normalizacion segura del slug (los GUID no se transforman).
  const clean = isGuid ? raw : _normalizeSlugInput(raw);

  if (!clean) {
    return _structuredError(
      ERRORCODES.SERVICENOT_FOUND,
      "Service identifier is required.",
      traceId
    );
  }

  const cached = serviceCatalogRAM.get(clean);
  if (cached && Date.now() - cached.timestamp 
        wixData
          .query(SERVICIOS_COL)
          .eq(lookupField, clean)
          .limit(1)
          // FIX-14: lectura consistente del CMS.
          .find({ suppressAuth: true, consistentRead: true }),
      WATCHDOGTIMEOUTMS,
      getServiceBySlugOrId:${lookupField}
    );

    const service = result?.items?.[0] || null;

    if (!service) {
      // FIX-15: trazabilidad mejorada con lookupField.
      log.error("Service not found in catalog", { key: clean, lookupField, traceId });
      return _structuredError(
        ERRORCODES.SERVICENOT_FOUND,
        "Service not found.",
        traceId
      );
    }

    // H-02: gate de vigencia con codigos diferenciados.
    const active = _readBooleanField(service, "active");
    if (!active) {
      log.warn("Service inactive", { key: clean, lookupField, traceId });
      return _structuredError(
        ERRORCODES.SERVICENOT_ACTIVE,
        "Service is not bookable.",
        traceId
      );
    }

    const catalogStatus = String(
      safeTrim(readImport2Field(service, "status")) || ""
    ).toUpperCase();
    if (catalogStatus && catalogStatus !== CATALOGSTATUSACTIVE) {
      log.warn("Service not active by status", {
        key: clean,
        lookupField,
        catalogStatus,
        traceId
      });
      return _structuredError(
        ERRORCODES.SERVICENOT_ACTIVE,
        "Service is not bookable.",
        traceId
      );
    }

    // FIX-13: errores de contrato del mapper como resultado estructurado.
    let mapped;
    try {
      mapped = await _mapServiceImport2ToUX(service, traceId);
    } catch (mapError) {
      const code = String(mapError?.code || "");
      const msg = String(mapError?.message || "");

      if (code === ERRORCODES.SERVICELOCATION_MISMATCH || msg.includes("location does not match")) {
        return structuredError(ERRORCODES.SERVICELOCATIONMISMATCH, msg, traceId);
      }
      if (code === ERRORCODES.ERRDUAL_MATH) {
        return structuredError(ERRORCODES.ERRDUALMATH, msg, traceId);
      }
      if (code === ERRORCODES.ERRDUAL_01) {
        return structuredError(ERRORCODES.ERRDUAL01, msg, traceId);
      }
      if (code === ERRORCODES.SERVICEITEMNATUREINVALID) {
        return structuredError(ERRORCODES.SERVICEITEMNATURE_INVALID, msg, traceId);
      }
      throw mapError;
    }

    // FIX-06: cache con claves canonicas (slug y serviceId).
    const cacheEntry = { data: mapped, timestamp: Date.now() };
    cacheSetBounded(serviceCatalogRAM, clean, cacheEntry, CACHEMAX_SIZE);
    cacheSetBounded(serviceCatalogRAM, mapped.serviceId, cacheEntry, CACHEMAX_SIZE);
    cacheSetBounded(serviceCatalogRAM, mapped.slug, cacheEntry, CACHEMAX_SIZE);

    return { status: "SUCCESS", data: mapped, error: null };
  } catch (error) {
    log.error("Error loading service", { traceId, message: error?.message });
    return _structuredError(
      ERRORCODES.DATABASEERROR,
      error?.message || "Error loading service.",
      traceId
    );
  }
}

export async function _resolveServiceIdInternal(serviceIdReq) {
  const raw = _safeTrim(serviceIdReq);
  if (!raw) return null;

  const key = looksLikeGuid(raw) ? raw : normalizeSlugInput(raw);
  if (!key) return null;

  const result = await _getServiceBySlugOrIdInternal(key);
  if (result?.status === "SUCCESS" && result?.data?.serviceId) {
    const serviceId = _safeTrim(result.data.serviceId);
    if (_looksLikeGuid(serviceId)) return serviceId;
  }
  return null;
}

export async function getServiceForBookingInternal(serviceId, traceId) {
  return _getServiceBySlugOrIdInternal(
    serviceId,
    traceId || makeTraceId("service-internal")
  );
}

// ============================================================================
// WEB METHODS - SERVICE
// ============================================================================

export const getServiceBySlugOrId = webMethod(
  Permissions.Anyone,
  async (slugOrId) => {
    const traceId = makeTraceId("wm-service");
    try {
      const result = await _getServiceBySlugOrIdInternal(slugOrId, traceId);
      if (result?.status !== "SUCCESS") return result;

      return {
        status: "SUCCESS",
        data: _toPublicService(result.data),
        error: null
      };
    } catch (error) {
      return {
        status: "ERROR",
        data: null,
        error: toPublicError(error, ERRORCODES.SERVICELOOKUPFAILED)
      };
    }
  }
);

export const resolveServiceId = webMethod(
  Permissions.Anyone,
  async (serviceIdRequest) => {
    try {
      const resolved = await _resolveServiceIdInternal(serviceIdRequest);
      if (!resolved) {
        return _structuredError(
          ERRORCODES.SERVICENOT_FOUND,
          "Service identifier not found."
        );
      }
      return { status: "SUCCESS", data: String(resolved), error: null };
    } catch (error) {
      return {
        status: "ERROR",
        data: null,
        error: toPublicError(error, ERRORCODES.SERVICERESOLVEFAILED)
      };
    }
  }
);

/
 * Superficie publica: sin notas internas, sin campos de uso exclusivo backend.
 */
export function _toPublicService(service) {
  if (!service || typeof service !== "object") return null;

  const {
    internalNotes,
    contactLocation,
    metadata,
    ...publicService
  } = service;

  const publicMetadata = metadata
    ? { ...metadata, internalNotes: undefined }
    : undefined;

  return {
    ...publicService,
    linkedPhases: publicService.linkedPhases || null,
    metadata: publicMetadata
  };
}

// ============================================================================
// DISPONIBILIDAD SINGLE
// ============================================================================

export const getAvailableSlots = webMethod(
  Permissions.Anyone,
  async (serviceIdOrSlug, resourceId, dateYmd, addOnIds) => {
    const traceId = makeTraceId("available-slots");
    const safeAddonIds = Array.isArray(addOnIds) ? addOnIds : [];

    try {
      const serviceResult = await _getServiceBySlugOrIdInternal(serviceIdOrSlug, traceId);
      if (serviceResult?.status !== "SUCCESS" || !serviceResult.data?.serviceId) {
        return serviceResult?.status === "ERROR"
          ? serviceResult
          : structuredError(ERRORCODES.SERVICENOTFOUND, "Service not found.", traceId);
      }

      const service = serviceResult.data;
      const serviceId = service.serviceId;

      if (service.clientHidden === true) {
        return _structuredError(
          ERRORCODES.SERVICEHIDDEN,
          "Service is not publicly bookable.",
          traceId
        );
      }

      if (service.allowCombine === true) {
        log.warn("getAvailableSlots called for dual service", {
          traceId,
          serviceId: String(serviceId)
        });
        return _structuredError(
          ERRORCODES.SERVICEIS_DUAL,
          "Use getCertifiedDualSlots for dual services.",
          traceId
        );
      }

      const requestedResourceId = _normalizeResourceIds(resourceId, traceId);
      const addonContext = _resolveAddonContextInternal(service, safeAddonIds);

      if (addonContext.nativeAddonIds.length > 0 && service.durationRange) {
        return _structuredError(
          ERRORCODES.DURATIONRANGEWITHADDONSNOTSUPPORTED,
          "Services with a duration range cannot be combined with addons.",
          traceId
        );
      }

      const ymd = _safeTrim(dateYmd);
      if (!_isValidMadridYmd(ymd)) {
        return _structuredError(
          ERRORCODES.INVALIDDATE,
          "Invalid booking date.",
          traceId
        );
      }

      const payload = {
        serviceId: String(serviceId),
        fromLocalDate: ${ymd}T00:00:00,
        toLocalDate: ${ymd}T23:59:59,
        timeZone: SDK_CONFIG.TZ,
        bookable: true,
        locations: [LOCATION_TS],
        includeResourceTypeIds: [STAFFRESOURCETYPE_ID]
      };

      if (requestedResourceId.length > 0) {
        payload.resourceTypes = [
          { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: requestedResourceId }
        ];
      }

      if (addonContext.nativeAddonIds.length > 0) {
        payload.customerChoices = { addOnIds: addonContext.nativeAddonIds };
      }

      const result = await _executeWithRetry(
        () =>
          withTimeout(
            () => availabilityTimeSlots.listAvailabilityTimeSlots(payload),
            WATCHDOGTIMEOUTMS,
            "getAvailableSlots"
          ),
        2,
        300
      );

      const timeSlots = Array.isArray(result?.timeSlots) ? result.timeSlots : [];
      const slots = timeSlots
        .filter((slot) => slot?.bookable === true)
        .map((slot) => _attachServiceId(slot, serviceId, traceId, "getAvailableSlots"))
        .filter(Boolean);

      return {
        status: "SUCCESS",
        data: {
          slots,
          serviceId,
          dateYmd: ymd,
          resourceId: requestedResourceId[0] || null
        },
        error: null
      };
    } catch (error) {
      log.warn("getAvailableSlots failed", {
        traceId,
        serviceIdOrSlug: _safeTrim(serviceIdOrSlug),
        dateYmd: _safeTrim(dateYmd),
        message: error?.message
      });
      return _structuredError(
        ERRORCODES.AVAILABLESLOTS_FAILED,
        "Could not load available slots.",
        traceId
      );
    }
  }
);

// ============================================================================
// DISPONIBILIDAD DIAS
// ============================================================================

export const getAvailableDays = webMethod(
  Permissions.Anyone,
  async (serviceIdOrSlug, resourceId, year, month, addOnIds) => {
    const traceId = makeTraceId("available-days");
    const safeAddonIds = Array.isArray(addOnIds) ? addOnIds : [];

    try {
      const serviceResult = await _getServiceBySlugOrIdInternal(serviceIdOrSlug, traceId);
      if (serviceResult?.status !== "SUCCESS" || !serviceResult.data?.serviceId) {
        return serviceResult?.status === "ERROR"
          ? serviceResult
          : structuredError(ERRORCODES.SERVICENOTFOUND, "Service not found.", traceId);
      }

      const service = serviceResult.data;
      const serviceId = service.serviceId;

      if (service.clientHidden === true) {
        return _structuredError(
          ERRORCODES.SERVICEHIDDEN,
          "Service is not publicly bookable.",
          traceId
        );
      }

      const y = Number(year);
      const m = Number(month);

      if (!Number.isFinite(y) || !Number.isFinite(m) || m  12) {
        return _structuredError(
          ERRORCODES.INVALIDDATE,
          "Invalid year/month.",
          traceId
        );
      }

      const monthStr = String(m).padStart(2, "0");
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const fromDate = ${y}-${monthStr}-01T00:00:00;
      const toDate = ${y}-${monthStr}-${String(lastDay).padStart(2, "0")}T23:59:59;

      const requestedResourceId = _normalizeResourceIds(resourceId, traceId);
      const addonContext = _resolveAddonContextInternal(service, safeAddonIds);

      const payload = {
        serviceId: String(serviceId),
        fromLocalDate: fromDate,
        toLocalDate: toDate,
        timeZone: SDK_CONFIG.TZ,
        bookable: true,
        locations: [LOCATION_TS],
        includeResourceTypeIds: [STAFFRESOURCETYPE_ID]
      };

      if (requestedResourceId.length > 0) {
        payload.resourceTypes = [
          { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: requestedResourceId }
        ];
      }

      if (addonContext.nativeAddonIds.length > 0 && !service.durationRange) {
        payload.customerChoices = { addOnIds: addonContext.nativeAddonIds };
      }

      const result = await _executeWithRetry(
        () =>
          withTimeout(
            () => availabilityTimeSlots.listAvailabilityTimeSlots(payload),
            WATCHDOGTIMEOUTMS,
            "getAvailableDays"
          ),
        2,
        300
      );

      const timeSlots = Array.isArray(result?.timeSlots) ? result.timeSlots : [];
      const daySet = new Set();

      for (const slot of timeSlots) {
        if (slot?.bookable !== true) continue;
        const localStart = _normalizeLocalIsoStr(slot?.localStartDate || slot?.startDate);
        if (!localStart) continue;
        daySet.add(localStart.slice(0, 10));
      }

      return {
        status: "SUCCESS",
        data: {
          days: Array.from(daySet).sort(),
          serviceId,
          year: y,
          month: m,
          resourceId: requestedResourceId[0] || null
        },
        error: null
      };
    } catch (error) {
      log.warn("getAvailableDays failed", { traceId, message: error?.message });
      return _structuredError(
        ERRORCODES.AVAILABLEDAYS_FAILED,
        "Could not load available days.",
        traceId
      );
    }
  }
);

// ============================================================================
// STAFF LOAD COUNTS FOR DAY (CITAS_F2)
// B-01: campo canonico bookingStatus (4.6 fila 15) y enum interno CANCELADO.
// ============================================================================

async function _countStaffLoadForDay(dateYmd, resourceIds, traceId) {
  const ymd = _safeTrim(dateYmd);
  const ids = cleanGuidList(resourceIds);
  const loadByResource = {};

  for (const id of ids) {
    loadByResource[id] = 0;
  }

  if (!ymd || ids.length === 0) {
    return loadByResource;
  }

  const cancelledStatus = String(BOOKING_STATUS?.CANCELADO || "CANCELADO");
  const idSet = new Set(ids);

  try {
    const result = await withTimeout(
      () =>
        wixData
          .query(COLLECTIONS.CITAS_F2)
          .eq("dateYmd", ymd)
          .limit(STAFFLOADQUERY_LIMIT)
          .find({ suppressAuth: true, consistentRead: true }),
      WATCHDOGTIMEOUTMS,
      "staffLoad:countDay"
    );

    for (const item of result?.items || []) {
      const rawStatus = String(item?.bookingStatus || "").trim();
      const status = _mapWixBookingStatusToInternal(rawStatus) || rawStatus.toUpperCase();

      if (status === cancelledStatus) continue;

      const resourceId = _safeTrim(item?.resourceId);
      if (!resourceId || !idSet.has(resourceId)) continue;

      loadByResource[resourceId] = (loadByResource[resourceId] || 0) + 1;
    }
  } catch (error) {
    log.warn("_countStaffLoadForDay failed; using zero loads", {
      traceId,
      dateYmd: ymd,
      message: error?.message
    });
  }

  return loadByResource;
}

// ============================================================================
// DISPONIBILIDAD DUAL (PATCH-02: pairToken determinista via huella canonica)
// ============================================================================

export async function _getCertifiedDualSlotsInternal(serviceId, resourceId, dateYmd, addOnIds) {
  const traceId = makeTraceId("dual-slots");
  const safeAddonIds = Array.isArray(addOnIds) ? addOnIds : [];
  const serviceRes = await _getServiceBySlugOrIdInternal(serviceId, traceId);

  if (serviceRes?.status !== "SUCCESS" || !serviceRes?.data) {
    return serviceRes?.status === "ERROR"
      ? serviceRes
      : structuredError(ERRORCODES.SERVICENOTFOUND, "Service not found.", traceId);
  }

  const service = serviceRes.data;

  if (service.clientHidden === true) {
    return _structuredError(
      ERRORCODES.SERVICEHIDDEN,
      "Service is not publicly bookable.",
      traceId
    );
  }

  if (service.allowCombine !== true || !_looksLikeGuid(service.linkedPhases)) {
    return _structuredError(
      ERRORCODES.SERVICENOT_DUAL,
      "Service is not configured as dual.",
      traceId
    );
  }

  const ymd = _safeTrim(dateYmd);
  if (!_isValidMadridYmd(ymd)) {
    return _structuredError(
      ERRORCODES.INVALIDDATE,
      "Invalid booking date.",
      traceId
    );
  }

  const requestedResourceId = _normalizeResourceIds(resourceId, traceId);
  const addonContext = _resolveAddonContextInternal(service, safeAddonIds);

  if (addonContext.nativeAddonIds.length > 0 && service.durationRange) {
    return _structuredError(
      ERRORCODES.DURATIONRANGEWITHADDONSNOTSUPPORTED,
      "Services with a duration range cannot be combined with addons.",
      traceId
    );
  }

  const buildListPayload = (svcId) => {
    const payload = {
      serviceId: String(svcId),
      fromLocalDate: ${ymd}T00:00:00,
      toLocalDate: ${ymd}T23:59:59,
      timeZone: SDK_CONFIG.TZ,
      bookable: true,
      locations: [LOCATION_TS],
      includeResourceTypeIds: [STAFFRESOURCETYPE_ID]
    };

    if (requestedResourceId.length > 0) {
      payload.resourceTypes = [
        { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: requestedResourceId }
      ];
    }

    if (addonContext.nativeAddonIds.length > 0) {
      payload.customerChoices = { addOnIds: addonContext.nativeAddonIds };
    }

    return payload;
  };

  // FASE 5 (REFACTORIZACION): los listados F1 y F2 son independientes entre
  // si (solo dependen del servicio y de la fecha), por lo que se lanzan en
  // paralelo con Promise.all. La latencia del motor dual pasa de dos
  // round-trips secuenciales a uno solo, sin alterar las reglas de negocio.
  const [f1Res, f2Res] = await Promise.all([
    _executeWithRetry(
      () =>
        withTimeout(
          () => availabilityTimeSlots.listAvailabilityTimeSlots(buildListPayload(service.serviceId)),
          WATCHDOGTIMEOUTMS,
          "dual:listF1"
        ),
      2,
      300
    ),
    _executeWithRetry(
      () =>
        withTimeout(
          () => availabilityTimeSlots.listAvailabilityTimeSlots(buildListPayload(service.linkedPhases)),
          WATCHDOGTIMEOUTMS,
          "dual:listF2"
        ),
      2,
      300
    )
  ]);

  const f1Slots = (Array.isArray(f1Res?.timeSlots) ? f1Res.timeSlots : []).filter(
    (s) => s?.bookable === true
  );

  const f2Slots = (Array.isArray(f2Res?.timeSlots) ? f2Res.timeSlots : []).filter(
    (s) => s?.bookable === true
  );

  // H-07: fuente unica availableStaff (4.3 fila 18).
  const staffPool = cleanGuidList(service.availableStaff || []);
  const loadByResource = await _countStaffLoadForDay(ymd, staffPool, traceId);

  const pairs = [];

  for (const f1 of f1Slots) {
    const f1Start = _normalizeLocalIsoStr(f1?.localStartDate || f1?.startDate);
    const f1End = _normalizeLocalIsoStr(f1?.localEndDate || f1?.endDate);
    if (!f1Start || !f1End) continue;

    const range = toUtcRange(f1Start, f1End);
    if (!range) continue;

    const f1Resources = getResourceIdsFromSlot(f1, STAFFRESOURCETYPEID);

    for (const f2 of f2Slots) {
      const f2Start = _normalizeLocalIsoStr(f2?.localStartDate || f2?.startDate);
      const f2End = _normalizeLocalIsoStr(f2?.localEndDate || f2?.endDate);
      if (!f2Start || !f2End) continue;

      const f2StartUtc = getUtcDateFromMadridLocal(f2Start);
      if (!f2StartUtc) continue;

      const rawGapMinutes = Math.round(
        (f2StartUtc.getTime() - range.endUtc.getTime()) / 60000
      );

      if (rawGapMinutes  MINUTOSMAXHUECO_DUAL) {
        continue;
      }

      const gapMinutes = rawGapMinutes;

      const f2Resources = getResourceIdsFromSlot(f2, STAFFRESOURCETYPEID);
      const shared = f1Resources.filter((id) => f2Resources.includes(id));
      if (shared.length === 0) continue;

      const pairResourceId =
        requestedResourceId[0] && shared.includes(requestedResourceId[0])
          ? requestedResourceId[0]
          : pickStaffByLowestLoad(shared, loadByResource) || shared[0];

      // PATCH-02 -> v5010.4: pairToken determinista via helper canonico
      // bookingCore._buildPairTokenDeterministic (huella unica en
      // bookingUtils._buildPairFingerprint).
      const pairToken = _buildPairTokenDeterministic({
        serviceId: service.serviceId,
        linkedPhases: service.linkedPhases,
        dateYmd: ymd,
        f1Start,
        f1End,
        f2Start,
        f2End,
        resourceId: pairResourceId
      });

      pairs.push({
        fase1: {
          slotRef: { ..._normalizeSlotShape(f1), serviceId: service.serviceId },
          resourceId: pairResourceId
        },
        fase2: {
          slotRef: { ..._normalizeSlotShape(f2), serviceId: service.linkedPhases },
          resourceId: pairResourceId
        },
        pairToken,
        serviceId: service.serviceId,
        linkedPhases: service.linkedPhases,
        dateYmd: ymd,
        gapMinutes,
        exposureDuration: Number(service.exposureDuration || 0) || 0,
        totalDuration: Number(service.totalDuration || 0) || 0
      });
    }
  }

  return { status: "SUCCESS", data: pairs, error: null, traceId };
}

export const getCertifiedDualSlots = webMethod(
  Permissions.Anyone,
  async (serviceIdOrSlug, resourceId, dateYmd, addOnIds) => {
    try {
      const resolved = await _resolveServiceIdInternal(serviceIdOrSlug);
      if (!resolved) {
        return _structuredError(
          ERRORCODES.SERVICENOT_FOUND,
          "Service identifier not found."
        );
      }
      return await _getCertifiedDualSlotsInternal(resolved, resourceId, dateYmd, addOnIds);
    } catch (error) {
      return {
        status: "ERROR",
        data: null,
        error: toPublicError(error, ERRORCODES.DUALSLOTSFAILED)
      };
    }
  }
);

// ============================================================================
// RESOLUCION DE STAFF
// ============================================================================

export async function _resolveStaffForSlotInternal({
  serviceId,
  f1Start,
  f1End,
  f2Start,
  f2End,
  requestedResourceId,
  addOnIds,
  traceId
}) {
  const activeTraceId = traceId || makeTraceId("staff-resolve");
  const safeAddonIds = Array.isArray(addOnIds) ? addOnIds : [];
  const resolved = await _resolveServiceIdInternal(serviceId);

  if (!resolved) {
    return _structuredError(
      ERRORCODES.SERVICENOT_FOUND,
      "Service identifier not found.",
      activeTraceId
    );
  }

  const normalizedAddonIds = Array.from(
    new Set(
      safeAddonIds
        .map((id) => _safeTrim(id))
        .filter((id) => _looksLikeGuid(id))
    )
  ).sort();

  const f1Result = await revalidateExactAvailabilitySlot({
    serviceId: resolved,
    localStartDate: f1Start,
    localEndDate: f1End,
    resourceId: requestedResourceId || null,
    nativeAddonIds: normalizedAddonIds,
    traceId: activeTraceId
  });

  if (f1Result?.status !== "SUCCESS") return f1Result;

  const finalResourceId = f1Result.data?.resourceId || requestedResourceId || null;

  let f2Result = null;

  if (f2Start && f2End) {
    const serviceConfig = await _getServiceBySlugOrIdInternal(resolved, activeTraceId);

    // H-07: fuente unica linkedPhases (4.3 fila 12).
    const linkedPhases = _safeTrim(serviceConfig?.data?.linkedPhases);

    if (!_looksLikeGuid(linkedPhases)) {
      return _structuredError(
        ERRORCODES.INVALIDPAYLOAD,
        "Dual requested but service has no linkedPhases.",
        activeTraceId
      );
    }

    f2Result = await revalidateExactAvailabilitySlot({
      serviceId: linkedPhases,
      localStartDate: f2Start,
      localEndDate: f2End,
      resourceId: finalResourceId,
      nativeAddonIds: normalizedAddonIds,
      traceId: activeTraceId
    });

    if (f2Result?.status !== "SUCCESS") return f2Result;
  }

  return {
    status: "SUCCESS",
    data: {
      resourceId: finalResourceId,
      slotF1: f1Result.data?.slot || null,
      slotF2: f2Result?.data?.slot || null
    },
    error: null
  };
}

export const resolveStaffForSlot = webMethod(
  Permissions.Anyone,
  async (serviceIdOrSlug, start, resourceId, addOnIds, end) => {
    try {
      const resolved = await _resolveServiceIdInternal(serviceIdOrSlug);
      if (!resolved) {
        return _structuredError(
          ERRORCODES.SERVICENOT_FOUND,
          "Service identifier not found."
        );
      }

      return await _resolveStaffForSlotInternal({
        serviceId: resolved,
        f1Start: start,
        f1End: end,
        f2Start: null,
        f2End: null,
        requestedResourceId: resourceId,
        addOnIds,
        traceId: makeTraceId("staff-resolve-wm")
      });
    } catch (error) {
      return {
        status: "ERROR",
        data: null,
        error: toPublicError(error, ERRORCODES.STAFFRESOLVEFAILED)
      };
    }
  }
);

// ============================================================================
// INVALIDACION DE CACHES
// ============================================================================

export async function _invalidateCachesInternal(serviceId, dateYmd, resourceId, traceId) {
  try {
    const sid = _safeTrim(serviceId);

    if (sid && _looksLikeGuid(sid)) {
      serviceCatalogRAM.delete(sid);
      for (const [key, entry] of serviceCatalogRAM.entries()) {
        if (entry?.data?.serviceId === sid) {
          serviceCatalogRAM.delete(key);
        }
      }
    }

    log.info("_invalidateCachesInternal", {
      traceId,
      serviceId: sid || null,
      dateYmd: _safeTrim(dateYmd) || null,
      resourceId: _safeTrim(resourceId) || null
    });

    return { status: "SUCCESS" };
  } catch (error) {
    log.warn("_invalidateCachesInternal failed", {
      traceId,
      message: error?.message
    });
    return { status: "ERROR", error: error?.message || "UNKNOWN" };
  }
}

// ============================================================================
// REVALIDACION EXACTA
// ============================================================================

export async function revalidateExactAvailabilitySlot({
  serviceId,
  localStartDate,
  localEndDate,
  resourceId,
  nativeAddonIds,
  traceId
}) {
  const activeTraceId = traceId || makeTraceId("exact-slot");
  const safeNativeAddonIds = Array.isArray(nativeAddonIds) ? nativeAddonIds : [];
  const resolvedServiceId = await _resolveServiceIdInternal(serviceId);
  const start = _normalizeLocalIsoStr(localStartDate);
  const end = _normalizeLocalIsoStr(localEndDate);

  const rawResourceId = _safeTrim(resourceId);
  const requiredResourceId = _looksLikeGuid(rawResourceId) ? rawResourceId : "";

  if (!resolvedServiceId || !start || !end || !_isValidSlotRange(start, end)) {
    return _structuredError(
      ERRORCODES.INVALIDSLOT_RECHECK,
      "Selected slot data is invalid.",
      activeTraceId
    );
  }

  try {
    const normalizedAddonIds = Array.from(
      new Set(
        safeNativeAddonIds
          .map((id) => _safeTrim(id))
          .filter((id) => _looksLikeGuid(id))
      )
    ).sort();

    const earlyServiceConfig = await _getServiceBySlugOrIdInternal(
      resolvedServiceId,
      activeTraceId
    );

    const serviceDurationRange =
      earlyServiceConfig?.status === "SUCCESS" && earlyServiceConfig?.data?.durationRange
        ? earlyServiceConfig.data.durationRange
        : null;

    if (normalizedAddonIds.length > 0 && serviceDurationRange) {
      return _structuredError(
        ERRORCODES.DURATIONRANGEWITHADDONSNOTSUPPORTED,
        "Services with a duration range cannot be combined with addons.",
        activeTraceId
      );
    }

    let rawSlot = null;

    if (normalizedAddonIds.length > 0) {
      const listPayload = {
        serviceId: String(resolvedServiceId),
        fromLocalDate: start,
        toLocalDate: end,
        timeZone: SDK_CONFIG.TZ,
        bookable: true,
        locations: [LOCATION_TS],
        includeResourceTypeIds: [STAFFRESOURCETYPE_ID],
        customerChoices: { addOnIds: normalizedAddonIds }
      };

      if (requiredResourceId) {
        listPayload.resourceTypes = [
          { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: [requiredResourceId] }
        ];
      }

      const listed = await _executeWithRetry(
        () =>
          withTimeout(
            () => availabilityTimeSlots.listAvailabilityTimeSlots(listPayload),
            WATCHDOGTIMEOUTMS,
            "exactSlot:list"
          ),
        2,
        300
      );

      rawSlot =
        (Array.isArray(listed?.timeSlots) ? listed.timeSlots : []).find((slot) => {
          const slotStart = _normalizeLocalIsoStr(slot?.localStartDate || slot?.startDate);
          const slotEnd = _normalizeLocalIsoStr(slot?.localEndDate || slot?.endDate);
          return slotStart === start && slotEnd === end && slot?.bookable === true;
        }) || null;
    } else {
      const getPayload = {
        serviceId: String(resolvedServiceId),
        localStartDate: start,
        localEndDate: end,
        location: LOCATION_TS,
        timeZone: SDK_CONFIG.TZ
      };

      if (requiredResourceId) {
        getPayload.resourceTypes = [
          { resourceTypeId: STAFFRESOURCETYPE_ID, resourceIds: [requiredResourceId] }
        ];
      }

      const result = await _executeWithRetry(
        () =>
          withTimeout(
            () => availabilityTimeSlots.getAvailabilityTimeSlot(getPayload),
            WATCHDOGTIMEOUTMS,
            "exactSlot:get"
          ),
        2,
        300
      );

      rawSlot = result?.timeSlot || null;
    }

    if (requiredResourceId) {
      const verification = await _verifyRequiredStaffViaGet({
        serviceId: resolvedServiceId,
        start,
        end,
        requiredResourceId,
        nativeAddonIds: normalizedAddonIds,
        traceId: activeTraceId
      });

      if (!verification.ok) {
        return _structuredError(
          ERRORCODES.STAFFUNAVAILABLE,
          "Selected staff is no longer available.",
          activeTraceId
        );
      }

      rawSlot = verification.slot;
    } else if (!rawSlot) {
      return _structuredError(
        ERRORCODES.SLOTUNAVAILABLE,
        "Selected slot is no longer available.",
        activeTraceId
      );
    }

    const returnedLocationId = _safeTrim(
      rawSlot?.location?.id || rawSlot?.slot?.location?.id
    );

    if (returnedLocationId && returnedLocationId !== LOCATION_ID) {
      return _structuredError(
        ERRORCODES.LOCATIONMISMATCH,
        "Availability location does not match configured location.",
        activeTraceId
      );
    }

    const normalizedSlot = _attachServiceId(
      rawSlot,
      resolvedServiceId,
      activeTraceId,
      "revalidateExactAvailabilitySlot"
    );

    const availableResourceIds = getResourceIdsFromSlot(normalizedSlot, STAFFRESOURCETYPEID);

    if (
      !normalizedSlot ||
      normalizedSlot.bookable !== true ||
      availableResourceIds.length === 0
    ) {
      return _structuredError(
        ERRORCODES.SLOTUNAVAILABLE,
        "Selected slot is no longer available.",
        activeTraceId
      );
    }

    if (requiredResourceId && !availableResourceIds.includes(requiredResourceId)) {
      return _structuredError(
        ERRORCODES.STAFFUNAVAILABLE,
        "Selected staff is no longer available.",
        activeTraceId
      );
    }

    if (earlyServiceConfig?.status === "SUCCESS" && earlyServiceConfig?.data) {
      const config = earlyServiceConfig.data;
      const startUtc = getUtcDateFromMadridLocal(start);
      const endUtc = getUtcDateFromMadridLocal(end);
      const actualMinutes = _minutesBetweenUtcDates(startUtc, endUtc);
      const durationRange = config.durationRange;

      if (durationRange && actualMinutes > 0) {
        const min = durationRange.min;
        const max = durationRange.max;
        const belowMin = min > 0 && actualMinutes  max;

        if (belowMin || aboveMax) {
          return _structuredError(
            ERRORCODES.SLOTDURATIONOUTOF_RANGE,
            "Selected slot duration is out of the allowed range.",
            activeTraceId
          );
        }
      } else {
        const expectedMinutes = resolveExpectedSlotMinutes(config);

        if (expectedMinutes > 0 && actualMinutes > 0) {
          if (Math.abs(actualMinutes - expectedMinutes) > 1) {
            return _structuredError(
              ERRORCODES.SLOTDURATION_MISMATCH,
              "Selected slot duration does not match service configuration.",
              activeTraceId
            );
          }
        }
      }
    }

    let balancedResourceId = requiredResourceId || null;

    if (!balancedResourceId && availableResourceIds.length === 1) {
      balancedResourceId = availableResourceIds[0];
    } else if (!balancedResourceId && availableResourceIds.length > 1) {
      const dayKey = _safeTrim(start).slice(0, 10);
      const loadMap = await _countStaffLoadForDay(
        dayKey,
        availableResourceIds,
        activeTraceId
      );
      balancedResourceId =
        pickStaffByLowestLoad(availableResourceIds, loadMap) ||
        availableResourceIds.slice().sort()[0];
    }

    return {
      status: "SUCCESS",
      data: {
        slot: {
          ...normalizedSlot,
          localStartDate: start,
          localEndDate: end
        },
        resourceId: balancedResourceId,
        candidateResourceIds: availableResourceIds,
        location: LOCATION_BOOKING
      },
      error: null
    };
  } catch (error) {
    log.warn("Exact slot revalidation failed", {
      traceId: activeTraceId,
      serviceId: String(resolvedServiceId),
      start,
      end,
      message: error?.message
    });
    return _structuredError(
      ERRORCODES.SLOTUNAVAILABLE,
      "Selected slot could not be revalidated.",
      activeTraceId
    );
  }
}

/
 * ============================================================================
 * FASE7 v5010.1 - getConfirmedBookingForDisplay
 * B-01: el estado oficial de Bookings se normaliza en la frontera y se
 *       compara contra el enum interno en espanol (BIBLIA 3.2 / D10).
 * ============================================================================
 */

const DISPLAY_STATUSES = new Set([
  String(BOOKING_STATUS?.CONFIRMADO || "CONFIRMADO").toUpperCase(),
  String(BOOKINGSTATUS?.PENDIENTEPAGO || "PENDIENTE_PAGO").toUpperCase()
]);

export const getConfirmedBookingForDisplay = webMethod(
  Permissions.Member,
  async ({ bookingId } = {}) => {
    const activeTraceId = makeTraceId("conf-display");
    const cleanId = _safeTrim(bookingId);

    if (!cleanId) {
      return {
        status: "ERROR",
        meta: { traceId: activeTraceId },
        data: null,
        error: { code: ERRORCODES.INVALIDPAYLOAD, message: "bookingId is required" }
      };
    }

    try {
      const getBookingElevated = elevate(bookings.booking.getBooking, ["Member"]);

      const raw = await getBookingElevated({
        bookingId: cleanId,
        getOptions: {
          additionalInfo: {
            fields: ["slot", "bookedBy", "contactDetails", "price", "formInfo"]
          }
        }
      });

      const info = raw?.booking?.info || {};
      const status = _mapWixBookingStatusToInternal(info.status);

      if (!status || !DISPLAY_STATUSES.has(status.toUpperCase())) {
        return {
          status: "ERROR",
          meta: { traceId: activeTraceId },
          data: null,
          error: {
            code: ERRORCODES.BOOKINGNOT_DISPLAYABLE,
            message: "Booking is not in a displayable confirmed state."
          }
        };
      }

      const slot = raw?.booking?.slot || {};
      const entities = Array.isArray(slot.bookedEntities) ? slot.bookedEntities : [];
      const firstEntity = entities[0] || {};
      const firstSlot = firstEntity.slot || slot.schedule || {};

      const pairToken =
        info?.form?.fields?.pairToken ||
        raw?.booking?.formInfo?.fields?.pairToken ||
        raw?.booking?.formInfo?.pairToken ||
        null;

      return {
        status: "SUCCESS",
        meta: { traceId: activeTraceId },
        data: {
          bookingId: String(info.id || cleanId),
          status,
          slot: {
            serviceId: firstSlot.serviceId || firstEntity.serviceId || null,
            scheduleId: firstSlot.scheduleId || null,
            startDate: firstSlot.startDate || null,
            endDate: firstSlot.endDate || null,
            timezone:
              firstSlot.timezone?.id ||
              SDKCONFIG.TIMEZONEID ||
              "Europe/Madrid"
          },
          resource: firstEntity.resource ? { id: firstEntity.resource.id } : null,
          location: firstEntity.location || null,
          totalParticipants: Number(info.totalParticipants) || 1,
          price: raw?.booking?.price?.formatted || null,
          contactDetails: raw?.booking?.contactDetails || {},
          pairToken
        },
        error: null
      };
    } catch (error) {
      log.warn("getConfirmedBookingForDisplay failed", {
        traceId: activeTraceId,
        bookingId: cleanId,
        message: error?.message
      });
      return {
        status: "ERROR",
        meta: { traceId: activeTraceId },
        data: null,
        error: {
          code: ERRORCODES.BOOKINGLOOKUP_FAILED,
          message: "Booking could not be loaded for confirmation display.",
          traceId: activeTraceId
        }
      };
    }
  }
);
export { ERRORCODES as RESERVASERROR_CODES };
