/*
=============================================================================
MODULE: pages/servicio-2.js
VERSION: v5011-F1-SERVICE-CATALOG-ALIGNED
BASE NORMATIVA:
  - BIBLIA2 / BIBLIAV (v5009-V20-FINAL-CONSOLIDATED-v4.2) Bloques 3, 4.2.3, 14
  - CAMBIO.txt secciones 3, 9, 11 (alias legacy: solo lectura transitoria V5010)
  - Dossier CMS vivo 30/09/2026 (Serv// FILE: src/pages/servicio-2.js
/*
=============================================================================
MODULE: pages/servicio-2.js
VERSION: v5011-F1-SERVICE-CATALOG-ALIGNED
BASE NORMATIVA:
  - BIBLIA2 / BIBLIAV (v5009-V20-FINAL-CONSOLIDATED-v4.2) Bloques 3, 4.2.3, 14
  - CAMBIO.txt secciones 3, 9, 11 (alias legacy: solo lectura transitoria V5010)
  - Dossier CMS vivo 30/09/2026 (ServiciosCatalogo rev.88, 44 claves tecnicas)

ALINEACION DE IDs TECNICAS APLICADA (Fase 1):
  Coleccion origen            : ServiciosCatalogo   (visible: SERVICIOS_CATALOGO)
  Coleccion complementos      : ComplementosCatalogo (visible: COMPLEMENTOS_CATALOGO)
  Colecciones NO consultadas  : ninguna desde frontend (delegado a reservas.web)

  Claves canonicas leidas     : serviceId, slug, title, description, tagLine,
                                mainMedia, price, currency, totalDuration,
                                phase1Duration, phase2Duration, exposureDuration,
                                durationRange, allowCombine, linkedPhases,
                                availableStaff, locationId, location, active,
                                status, clientHidden, itemNature, serviceType,
                                onlinePayment, inPersonPayment, depositType,
                                depositAmount, pricingModel, recomendaciones
  Claves legacy toleradas     : slug, tituloServicio, addOnOptions, addOnId
                                (SOLO lectura; nunca escritura - CAMBIO.txt)
  Claves visibles NO usadas   : servicioID, titulo, principalMedia, duracionTotal,
                                permitirCombinacion, fasesVinculadas, disponibleStaff,
                                clienteOculto, estado, localizacionID
                                (dossier 14: la etiqueta visible NO es clave tecnica)

  Reglas R19 / D8 / D10 respetadas:
    - IDs nativas Wix preservadas en ingles camelCase (serviceId, linkedPhases).
    - linkedPhases conserva GUID Wix; nunca se convierte a slug (BIBLIAV 10).
    - availableStaff es MULTI_REFERENCE a Members (staffMemberId), NO resourceId:
      la resolucion a resourceId se hace en backend (booking/staffResolver).
    - status interno en espanol MAYUSCULAS (ACTIVO/INACTIVO/BORRADOR).
    - Campos fiscales (tipoImpositivo, codigoImpuesto, claveRegimen,
      cuentaContable*, internalNotes, costPrice, margin) NUNCA se proyectan
      al widget publico (BIBLIAV 24).
=============================================================================
*/

import wixLocation from "wix-location-frontend";
import { getServiceBySlugOrId } from "backend/reservas.web";
import {
  MESSAGE_TYPES,
  URLS,
  makeTraceId,
  _safeTrim,
  _safeSlugOrId,
  _looksLikeGuid
} from "public/mmUtils";
import { createWidgetBridge } from "public/widgetBridge";

/* ============================================================================
 * CONSTANTES DE MODULO (alineadas a internalConfig / BIBLIA 3.2)
 * ==========================================================================*/

// BOOKINGS_ADDON_CONFIG.MAX_POR_RESERVA = 5 (BIBLIA 3.2 / 4.3 fila 19).
const MAX_ADDONS_POR_RESERVA = 5;

// SITE.CURRENCY (no se importa internalConfig desde frontend).
const DEFAULT_CURRENCY = "EUR";

// CATALOG_STATES canonicos: espanol MAYUSCULAS (D10).
const CATALOG_STATUS = Object.freeze({
  ACTIVO: "ACTIVO",
  INACTIVO: "INACTIVO",
  BORRADOR: "BORRADOR"
});

// Lectura transitoria V5010 de estados legacy en ingles (CAMBIO.txt 9).
const LEGACY_CATALOG_STATUS_MAP = Object.freeze({
  ACTIVE: "ACTIVO",
  INACTIVE: "INACTIVO",
  DRAFT: "BORRADOR",
  ARCHIVED: "INACTIVO"
});

// Proyeccion publica autorizada hacia el widget. Todo lo demas se descarta.
const PUBLIC_SERVICE_FIELDS = Object.freeze([
  "serviceId",
  "slug",
  "title",
  "description",
  "tagLine",
  "mainMedia",
  "mainMedia",
  "price",
  "currency",
  "totalDuration",
  "phase1Duration",
  "phase2Duration",
  "exposureDuration",
  "durationRange",
  "allowCombine",
  "linkedPhases",
  "addons",
  "location",
  "serviceType",
  "onlinePayment",
  "inPersonPayment",
  "depositType",
  "depositAmount",
  "pricingModel",
  "metadata"
]);

const EXCLUDED_PATH_SEGMENTS = Object.freeze([
  "servicios",
  "service",
  "servicio",
  "servicio-2"
]);

let bridge = null;
let resolvedService = null;

/* ============================================================================
 * HELPERS DE NORMALIZACION (clave tecnica, nunca etiqueta visible)
 * ==========================================================================*/

function text(value, fallback = "") {
  return _safeTrim(value) || fallback;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
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

/**
 * Lectura canonica con tolerancia de alias legacy (solo transicion V5010).
 * ESCRITURA: siempre la clave canonica. LECTURA: canonical ?? alias.
 */
function pick(source, canonicalKey, legacyKeys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const canonical = source[canonicalKey];
  if (canonical !== undefined && canonical !== null && canonical !== "") {
    return canonical;
  }

  const aliases = Array.isArray(legacyKeys) ? legacyKeys : [];
  for (let i = 0; i < aliases.length; i += 1) {
    const value = source[aliases[i]];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function getSafeMessage(error, fallback) {
  return text(error?.message, fallback);
}

/**
 * REFERENCIA unica (tipo CMS REFERENCE): admite string, {_id}, {id}, {value}.
 */
function getReferenceId(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return text(value);
  }

  if (Array.isArray(value)) {
    return value.length ? getReferenceId(value[0]) : "";
  }

  if (typeof value === "object") {
    return text(
      value._id ||
      value.id ||
      value.referenceId ||
      value.value
    );
  }

  return "";
}

/**
 * MULTI_REFERENCE (availableStaff, locationId, recomendaciones):
 * devuelve lista de IDs tecnicos, sin duplicados y sin inventar referencias.
 */
function getReferenceIds(value) {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value) ? value : [value];

  const ids = raw
    .map((entry) => {
      if (!entry) {
        return "";
      }
      if (typeof entry === "string") {
        return text(entry);
      }
      if (typeof entry === "object") {
        return text(entry._id || entry.id || entry.referenceId || entry.value);
      }
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
}

/** status canonico en espanol MAYUSCULAS; tolera legacy ingles en lectura. */
function normalizeCatalogStatus(value) {
  const clean = text(value).toUpperCase();
  if (!clean) {
    return "";
  }
  if (Object.values(CATALOG_STATUS).includes(clean)) {
    return clean;
  }
  return LEGACY_CATALOG_STATUS_MAP[clean] || clean;
}

/* ============================================================================
 * PROYECCION PUBLICA DEL SERVICIO (ServiciosCatalogo -> DTO del widget)
 * ==========================================================================*/

function getServiceId(service) {
  if (!service || typeof service !== "object") {
    return "";
  }
  // Identificador canonico Wix (R19): nunca se traduce ni se sustituye por slug.
  return getReferenceId(service.serviceId);
}

function getServiceSlug(service) {
  if (!service || typeof service !== "object") {
    return "";
  }
  // slug = identidad publica (BIBLIAV 10). slug es legacy de lectura.
  return _safeSlugOrId(text(pick(service, "slug", ["slug"])));
}

function getServiceImage(service) {
  if (!service || typeof service !== "object") {
    return "";
  }

  const metadata =
    service.metadata && typeof service.metadata === "object"
      ? service.metadata
      : {};

  // Clave tecnica canonica: mainMedia (visible: principalMedia).
  return text(pick(service, "mainMedia", ["mainMedia"]) || pick(metadata, "mainMedia", ["mainMedia"]));
}

/** Aritmetica dual SSOT: totalDuration = phase1 + exposure + phase2. */
function resolveTotalDuration(data, metadata) {
  const declared = num(
    pick(data, "totalDuration", []) ?? metadata.totalDuration,
    0
  );

  const phase1 = num(pick(data, "phase1Duration", []), 0);
  const exposure = num(pick(data, "exposureDuration", []), 0);
  const phase2 = num(pick(data, "phase2Duration", []), 0);
  const computed = phase1 + exposure + phase2;

  return declared > 0 ? declared : computed;
}

/**
 * Complementos: la fuente canonica es ComplementosCatalogo (addOnId).
 * addOnOptions NO existe como clave tecnica en ServiciosCatalogo vivo;
 * se tolera su lectura durante V5010 y se normaliza a addOnId.
 */
function normalizeAddon(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const id = text(entry);
    return id ? { addOnId: id, title: "", price: 0, currency: DEFAULT_CURRENCY } : null;
  }

  if (typeof entry !== "object") {
    return null;
  }

  // Canonico: addOnId. Legacy de lectura: addOnId / id / nativeId.
  const addOnId = text(pick(entry, "addOnId", ["addOnId", "nativeId", "id", "_id"]));
  if (!addOnId) {
    return null;
  }

  return {
    addOnId,
    nativeId: text(entry.nativeId),
    title: text(pick(entry, "title", ["name"])),
    description: text(entry.description),
    price: num(entry.price, 0),
    currency: text(entry.currency, DEFAULT_CURRENCY),
    durationInMinutes: num(entry.durationInMinutes, 0),
    maxQuantity: num(entry.maxQuantity, 1),
    active: bool(entry.active, true)
  };
}

function normalizeAddons(data, metadata) {
  const raw =
    pick(data, "addOnOptions", ["complementos", "addons"]) ??
    metadata.addOnOptions ??
    metadata.addons ??
    [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(normalizeAddon)
    .filter((addon) => addon && addon.active !== false)
    .slice(0, MAX_ADDONS_POR_RESERVA);
}

function normalizeService(data) {
  const serviceId = getServiceId(data);
  const slug = getServiceSlug(data);
  const mainMedia = getServiceImage(data);

  if (!_looksLikeGuid(serviceId)) {
    throw new Error("El servicio no tiene un serviceId valido.");
  }

  if (!slug) {
    throw new Error("El servicio no tiene un slug valido.");
  }

  const sourceMetadata =
    data.metadata && typeof data.metadata === "object"
      ? data.metadata
      : {};

  // Visibilidad y vigencia canonicas: clientHidden + active + status.
  const clientHidden = bool(pick(data, "clientHidden", ["hiddenClient", "hiddenCliente"]), false);
  const active = bool(pick(data, "active", ["activo"]), true);
  const status = normalizeCatalogStatus(pick(data, "status", ["estado"]));

  if (clientHidden || active === false || (status && status !== CATALOG_STATUS.ACTIVO)) {
    // Servicio F2 interno / no publicable: no se expone al widget.
    throw new Error("El servicio solicitado no esta disponible.");
  }

  // linkedPhases: REFERENCE con GUID Wix. Nunca se convierte a slug.
  const linkedPhases = getReferenceId(
    pick(data, "linkedPhases", ["linkFases", "linkedPhasess"]) ||
    sourceMetadata.linkedPhases
  );

  const allowCombine = bool(pick(data, "allowCombine", []), false) &&
    bool(sourceMetadata.allowCombine, true);

  const metadata = {
    ...sourceMetadata,

    title: text(pick(data, "title", ["tituloServicio"]) || sourceMetadata.title),
    description: text(pick(data, "description", ["descripcion"]) || sourceMetadata.description),
    tagLine: text(pick(data, "tagLine", ["resumen"]) || sourceMetadata.tagLine),
    location: text(pick(data, "location", ["localizacion"]) || sourceMetadata.location),

    totalDuration: resolveTotalDuration(data, sourceMetadata),
    phase1Duration: num(pick(data, "phase1Duration", []), 0),
    phase2Duration: num(pick(data, "phase2Duration", []), 0),
    exposureDuration: num(pick(data, "exposureDuration", []), 0),
    durationRange: pick(data, "durationRange", []) || sourceMetadata.durationRange || null,

    price: num(pick(data, "price", ["precio"]) ?? sourceMetadata.price, 0),
    currency: text(pick(data, "currency", ["moneda"]), DEFAULT_CURRENCY),

    mainMedia: mainMedia,
    mainMedia,

    serviceType: text(pick(data, "serviceType", ["servicioTipo"])),
    itemNature: text(pick(data, "itemNature", ["naturalezaItem"])),

    allowCombine,
    linkedPhases: allowCombine && _looksLikeGuid(linkedPhases) ? linkedPhases : "",

    onlinePayment: bool(pick(data, "onlinePayment", ["pagoOnline"]), false),
    inPersonPayment: bool(pick(data, "inPersonPayment", ["pagoPresencial"]), true),
    depositType: text(pick(data, "depositType", ["depositoTipo"])),
    depositAmount: num(pick(data, "depositAmount", ["depositoImporte"]), 0),
    pricingModel: text(pick(data, "pricingModel", ["modeloPrecio"])),

    status: status || CATALOG_STATUS.ACTIVO,
    clientHidden: false,

    // MULTI_REFERENCE: IDs tecnicos sin transformar.
    // availableStaff -> Members (staffMemberId). La conversion a resourceId
    // de Bookings se resuelve en backend, nunca en el frontend.
    availableStaffIds: getReferenceIds(pick(data, "availableStaff", ["staffDisponible"])),
    locationIds: getReferenceIds(pick(data, "locationId", [])),
    recommendationIds: getReferenceIds(pick(data, "recomendaciones", []))
  };

  const dto = {
    serviceId,
    slug,
    title: metadata.title,
    description: metadata.description,
    tagLine: metadata.tagLine,
    location: metadata.location,
    totalDuration: metadata.totalDuration,
    phase1Duration: metadata.phase1Duration,
    phase2Duration: metadata.phase2Duration,
    exposureDuration: metadata.exposureDuration,
    durationRange: metadata.durationRange,
    price: metadata.price,
    currency: metadata.currency,
    mainMedia: mainMedia,
    mainMedia,
    serviceType: metadata.serviceType,
    addons: normalizeAddons(data, sourceMetadata),
    allowCombine: metadata.allowCombine,
    linkedPhases: metadata.linkedPhases,
    onlinePayment: metadata.onlinePayment,
    inPersonPayment: metadata.inPersonPayment,
    depositType: metadata.depositType,
    depositAmount: metadata.depositAmount,
    pricingModel: metadata.pricingModel,
    metadata
  };

  return projectPublicService(dto);
}

/**
 * Lista blanca de salida: garantiza que ningun campo fiscal, de coste o de
 * notas internas (tipoImpositivo, codigoImpuesto, claveRegimen,
 * cuentaContableIngreso/Gasto, costPrice, margin, internalNotes) llegue al
 * widget HTML embebido.
 */
function projectPublicService(dto) {
  const projected = {};

  PUBLIC_SERVICE_FIELDS.forEach((field) => {
    if (dto[field] !== undefined) {
      projected[field] = dto[field];
    }
  });

  return projected;
}

/* ============================================================================
 * RESOLUCION DE IDENTIDAD PUBLICA (slug优先, serviceId tecnico)
 * ==========================================================================*/

async function resolveServiceLookup() {
  const query = wixLocation.query || {};

  // Orden canonico: slug (publico) -> serviceId (tecnico Wix).
  // slug queda como alias legacy de lectura (CAMBIO.txt 3, retirada V5010).
  const candidates = [
    query.slug,
    query.serviceId,
    query.slug
  ];

  for (const candidate of candidates) {
    const value = _safeSlugOrId(candidate);
    if (value) {
      return value;
    }
  }

  const path = Array.isArray(wixLocation.path) ? wixLocation.path : [];
  const value = _safeSlugOrId(path[path.length - 1] || "");

  if (!value || EXCLUDED_PATH_SEGMENTS.includes(value)) {
    return null;
  }

  return value;
}

/* ============================================================================
 * NAVEGACION A RESERVA
 * ==========================================================================*/

function getAddonIds(payload) {
  if (!payload || !Array.isArray(payload.addons)) {
    return [];
  }

  return Array.from(
    new Set(
      payload.addons
        .map((addon) => {
          if (addon && typeof addon === "object") {
            // Canonico: addOnId (ComplementosCatalogo). Legacy: addOnId / id.
            return text(addon.addOnId || addon.nativeId || addon.addOnId || addon.id);
          }
          return text(addon);
        })
        .filter(Boolean)
    )
  ).slice(0, MAX_ADDONS_POR_RESERVA);
}

function buildBookingUrl(service, payload) {
  const base = text(URLS?.CALENDARIO_2, "/booking-calendar/calendario-2");

  const serviceId = getServiceId(service);
  const slug = getServiceSlug(service);

  const query = [
    `slug=${encodeURIComponent(slug)}`,
    `serviceId=${encodeURIComponent(serviceId)}`,
    "referral=servicio-2"
  ];

  const addOnIds = getAddonIds(payload);

  if (addOnIds.length) {
    query.push(`addOnIds=${encodeURIComponent(addOnIds.join(","))}`);
  }

  return `${base}?${query.join("&")}`;
}

function getServicesUrl() {
  return text(URLS?.SERVICIOS, "/reserva-online");
}

/* ============================================================================
 * CARGA DEL SERVICIO (delegada al backend: unica ruta de lectura CMS)
 * ==========================================================================*/

async function loadService(lookupValue) {
  const result = await getServiceBySlugOrId(lookupValue);

  if (
    !result ||
    result.status !== "SUCCESS" ||
    !result.data ||
    typeof result.data !== "object"
  ) {
    throw new Error(result?.error?.message || "Servicio no encontrado.");
  }

  return normalizeService(result.data);
}

function showError(message) {
  const safeMessage = text(message, "No se pudo cargar el servicio.");

  console.error("[servicio-2] Error:", safeMessage);

  try {
    const banner = $w("#errorBanner");

    if (!banner) {
      return;
    }

    banner.text = `Error: ${safeMessage}`;

    if (typeof banner.show === "function") {
      banner.show();
    }
  } catch (error) {
    console.warn("[servicio-2] No se pudo mostrar el error:", error?.message);
  }
}

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
 * CICLO DE VIDA DE PAGINA
 * ==========================================================================*/

$w.onReady(async () => {
  const traceId = makeTraceId("servicio");
  let widget;

  try {
    widget = $w("#htmlWidgetCustomService");
  } catch (error) {
    showError("El widget del servicio no está disponible.");
    return;
  }

  if (
    !widget ||
    typeof widget.postMessage !== "function" ||
    typeof widget.onMessage !== "function"
  ) {
    showError("El widget del servicio no está disponible.");
    return;
  }

  try {
    const lookupValue = await resolveServiceLookup();

    if (!lookupValue) {
      showError("No se pudo localizar el servicio en la URL.");
      return;
    }

    bridge = createWidgetBridge(widget, {
      onContextReady: async () => {
        resolvedService = await loadService(lookupValue);
        return resolvedService;
      },

      onWidgetMessage: async (message) => {
        const type = getMessageType(message);
        const payload = getPayload(message);

        if (!resolvedService) {
          console.warn("[servicio-2] Servicio aún no disponible", { traceId, type });
          return;
        }

        if (type === MESSAGE_TYPES.BOOK) {
          wixLocation.to(buildBookingUrl(resolvedService, payload));
          return;
        }

        if (type === MESSAGE_TYPES.NAV) {
          const target = text(payload.target).toUpperCase();

          if (!target || target === "SERVICIOS") {
            wixLocation.to(getServicesUrl());
          }

          return;
        }

        if (type === MESSAGE_TYPES.READY || type === MESSAGE_TYPES.CONTEXT) {
          return;
        }

        console.warn("[servicio-2] Mensaje no soportado", { traceId, type });
      },

      onError: (error) => {
        showError(getSafeMessage(error, "No se pudo cargar el servicio."));
      }
    });

    if (!bridge) {
      showError("No se pudo inicializar el widget del servicio.");
    }
  } catch (error) {
    console.error("[servicio-2] Error de inicialización", {
      traceId,
      message: error?.message
    });

    showError(getSafeMessage(error, "No se pudo cargar el servicio."));
  }
});

/*ServiciosCatalogo rev.88, 44 claves tecnicas)

ALINEACION DE IDs TECNICAS APLICADA (Fase 1):
  Coleccion origen            : ServiciosCatalogo   (visible: SERVICIOS_CATALOGO)
  Coleccion complementos      : ComplementosCatalogo (visible: COMPLEMENTOS_CATALOGO)
  Colecciones NO consultadas  : ninguna desde frontend (delegado a reservas.web)

  Claves canonicas leidas     : serviceId, slug, title, description, tagLine,
                                mainMedia, price, currency, totalDuration,
                                phase1Duration, phase2Duration, exposureDuration,
                                durationRange, allowCombine, linkedPhases,
                                availableStaff, locationId, location, active,
                                status, clientHidden, itemNature, serviceType,
                                onlinePayment, inPersonPayment, depositType,
                                depositAmount, pricingModel, recomendaciones
  Claves legacy toleradas     : slug, tituloServicio, addOnOptions, addOnId
                                (SOLO lectura; nunca escritura - CAMBIO.txt)
  Claves visibles NO usadas   : servicioID, titulo, principalMedia, duracionTotal,
                                permitirCombinacion, fasesVinculadas, disponibleStaff,
                                clienteOculto, estado, localizacionID
                                (dossier 14: la etiqueta visible NO es clave tecnica)

  Reglas R19 / D8 / D10 respetadas:
    - IDs nativas Wix preservadas en ingles camelCase (serviceId, linkedPhases).
    - linkedPhases conserva GUID Wix; nunca se convierte a slug (BIBLIAV 10).
    - availableStaff es MULTI_REFERENCE a Members (staffMemberId), NO resourceId:
      la resolucion a resourceId se hace en backend (booking/staffResolver).
    - status interno en espanol MAYUSCULAS (ACTIVO/INACTIVO/BORRADOR).
    - Campos fiscales (tipoImpositivo, codigoImpuesto, claveRegimen,
      cuentaContable*, internalNotes, costPrice, margin) NUNCA se proyectan
      al widget publico (BIBLIAV 24).
=============================================================================
*/

import wixLocation from "wix-location-frontend";
import { getServiceBySlugOrId } from "backend/reservas.web";
import {
  MESSAGE_TYPES,
  URLS,
  makeTraceId,
  _safeTrim,
  _safeSlugOrId,
  _looksLikeGuid
} from "public/mmUtils";
import { createWidgetBridge } from "public/widgetBridge";

/* ============================================================================
 CONSTANTES DE MODULO (alineadas a internalConfig / BIBLIA 3.2)
  ==========================================================================*/

// BOOKINGSADDONCONFIG.MAXPORRESERVA = 5 (BIBLIA 3.2 / 4.3 fila 19).
const MAXADDONSPOR_RESERVA = 5;

// SITE.CURRENCY (no se importa internalConfig desde frontend).
const DEFAULT_CURRENCY = "EUR";

// CATALOG_STATES canonicos: espanol MAYUSCULAS (D10).
const CATALOG_STATUS = Object.freeze({
  ACTIVO: "ACTIVO",
  INACTIVO: "INACTIVO",
  BORRADOR: "BORRADOR"
});

// Lectura transitoria V5010 de estados legacy en ingles (CAMBIO.txt 9).
const LEGACYCATALOGSTATUS_MAP = Object.freeze({
  ACTIVE: "ACTIVO",
  INACTIVE: "INACTIVO",
  DRAFT: "BORRADOR",
  ARCHIVED: "INACTIVO"
});

// Proyeccion publica autorizada hacia el widget. Todo lo demas se descarta.
const PUBLICSERVICEFIELDS = Object.freeze([
  "serviceId",
  "slug",
  "title",
  "description",
  "tagLine",
  "mainMedia",
  "mainMedia",
  "price",
  "currency",
  "totalDuration",
  "phase1Duration",
  "phase2Duration",
  "exposureDuration",
  "durationRange",
  "allowCombine",
  "linkedPhases",
  "addons",
  "location",
  "serviceType",
  "onlinePayment",
  "inPersonPayment",
  "depositType",
  "depositAmount",
  "pricingModel",
  "metadata"
]);

const EXCLUDEDPATHSEGMENTS = Object.freeze([
  "servicios",
  "service",
  "servicio",
  "servicio-2"
]);

let bridge = null;
let resolvedService = null;

/* ============================================================================
  HELPERS DE NORMALIZACION (clave tecnica, nunca etiqueta visible)
  ==========================================================================*/

function text(value, fallback = "") {
  return _safeTrim(value) || fallback;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
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

/* Lectura canonica con tolerancia de alias legacy (solo transicion V5010).
 * ESCRITURA: siempre la clave canonica. LECTURA: canonical ?? alias.
 */
function pick(source, canonicalKey, legacyKeys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const canonical = source[canonicalKey];
  if (canonical !== undefined && canonical !== null && canonical !== "") {
    return canonical;
  }

  const aliases = Array.isArray(legacyKeys) ? legacyKeys : [];
  for (let i = 0; i  {
      if (!entry) {
        return "";
      }
      if (typeof entry === "string") {
        return text(entry);
      }
      if (typeof entry === "object") {
        return text(entry._id || entry.id || entry.referenceId || entry.value);
      }
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
}

/ status canonico en espanol MAYUSCULAS; tolera legacy ingles en lectura. */
function normalizeCatalogStatus(value) {
  const clean = text(value).toUpperCase();
  if (!clean) {
    return "";
  }
  if (Object.values(CATALOG_STATUS).includes(clean)) {
    return clean;
  }
  return LEGACYCATALOGSTATUS_MAP[clean] || clean;
}

/* ============================================================================
 * PROYECCION PUBLICA DEL SERVICIO (ServiciosCatalogo -> DTO del widget)
  ==========================================================================*/

function getServiceId(service) {
  if (!service || typeof service !== "object") {
    return "";
  }
  // Identificador canonico Wix (R19): nunca se traduce ni se sustituye por slug.
  return getReferenceId(service.serviceId);
}

function getServiceSlug(service) {
  if (!service || typeof service !== "object") {
    return "";
  }
  // slug = identidad publica (BIBLIAV 10). slug es legacy de lectura.
  return _safeSlugOrId(text(pick(service, "slug", ["slug"])));
}

function getServiceImage(service) {
  if (!service || typeof service !== "object") {
    return "";
  }

  const metadata =
    service.metadata && typeof service.metadata === "object"
      ? service.metadata
      : {};

  // Clave tecnica canonica: mainMedia (visible: principalMedia).
  return text(pick(service, "mainMedia", ["mainMedia"]) || pick(metadata, "mainMedia", ["mainMedia"]));
}

/ Aritmetica dual SSOT: totalDuration = phase1 + exposure + phase2. */
function resolveTotalDuration(data, metadata) {
  const declared = num(
    pick(data, "totalDuration", []) ?? metadata.totalDuration,
    0
  );

  const phase1 = num(pick(data, "phase1Duration", []), 0);
  const exposure = num(pick(data, "exposureDuration", []), 0);
  const phase2 = num(pick(data, "phase2Duration", []), 0);
  const computed = phase1 + exposure + phase2;

  return declared > 0 ? declared : computed;
}

/* Complementos: la fuente canonica es ComplementosCatalogo (addOnId).
 * addOnOptions NO existe como clave tecnica en ServiciosCatalogo vivo;
 * se tolera su lectura durante V5010 y se normaliza a addOnId.
 */
function normalizeAddon(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const id = text(entry);
    return id ? { addOnId: id, title: "", price: 0, currency: DEFAULT_CURRENCY } : null;
  }

  if (typeof entry !== "object") {
    return null;
  }

  // Canonico: addOnId. Legacy de lectura: addOnId / id / nativeId.
  const addOnId = text(pick(entry, "addOnId", ["addOnId", "nativeId", "id", "_id"]));
  if (!addOnId) {
    return null;
  }

  return {
    addOnId,
    nativeId: text(entry.nativeId),
    title: text(pick(entry, "title", ["name"])),
    description: text(entry.description),
    price: num(entry.price, 0),
    currency: text(entry.currency, DEFAULT_CURRENCY),
    durationInMinutes: num(entry.durationInMinutes, 0),
    maxQuantity: num(entry.maxQuantity, 1),
    active: bool(entry.active, true)
  };
}

function normalizeAddons(data, metadata) {
  const raw =
    pick(data, "addOnOptions", ["complementos", "addons"]) ??
    metadata.addOnOptions ??
    metadata.addons ??
    [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(normalizeAddon)
    .filter((addon) => addon && addon.active !== false)
    .slice(0, MAXADDONSPOR_RESERVA);
}

function normalizeService(data) {
  const serviceId = getServiceId(data);
  const slug = getServiceSlug(data);
  const mainMedia = getServiceImage(data);

  if (!_looksLikeGuid(serviceId)) {
    throw new Error("El servicio no tiene un serviceId valido.");
  }

  if (!slug) {
    throw new Error("El servicio no tiene un slug valido.");
  }

  const sourceMetadata =
    data.metadata && typeof data.metadata === "object"
      ? data.metadata
      : {};

  // Visibilidad y vigencia canonicas: clientHidden + active + status.
  const clientHidden = bool(pick(data, "clientHidden", ["hiddenClient", "hiddenCliente"]), false);
  const active = bool(pick(data, "active", ["activo"]), true);
  const status = normalizeCatalogStatus(pick(data, "status", ["estado"]));

  if (clientHidden || active === false || (status && status !== CATALOG_STATUS.ACTIVO)) {
    // Servicio F2 interno / no publicable: no se expone al widget.
    throw new Error("El servicio solicitado no esta disponible.");
  }

  // linkedPhases: REFERENCE con GUID Wix. Nunca se convierte a slug.
  const linkedPhases = getReferenceId(
    pick(data, "linkedPhases", ["linkFases", "linkedPhasess"]) ||
    sourceMetadata.linkedPhases
  );

  const allowCombine = bool(pick(data, "allowCombine", []), false) &&
    bool(sourceMetadata.allowCombine, true);

  const metadata = {
    ...sourceMetadata,

    title: text(pick(data, "title", ["tituloServicio"]) || sourceMetadata.title),
    description: text(pick(data, "description", ["descripcion"]) || sourceMetadata.description),
    tagLine: text(pick(data, "tagLine", ["resumen"]) || sourceMetadata.tagLine),
    location: text(pick(data, "location", ["localizacion"]) || sourceMetadata.location),

    totalDuration: resolveTotalDuration(data, sourceMetadata),
    phase1Duration: num(pick(data, "phase1Duration", []), 0),
    phase2Duration: num(pick(data, "phase2Duration", []), 0),
    exposureDuration: num(pick(data, "exposureDuration", []), 0),
    durationRange: pick(data, "durationRange", []) || sourceMetadata.durationRange || null,

    price: num(pick(data, "price", ["precio"]) ?? sourceMetadata.price, 0),
    currency: text(pick(data, "currency", ["moneda"]), DEFAULT_CURRENCY),

    mainMedia: mainMedia,
    mainMedia,

    serviceType: text(pick(data, "serviceType", ["servicioTipo"])),
    itemNature: text(pick(data, "itemNature", ["naturalezaItem"])),

    allowCombine,
    linkedPhases: allowCombine && _looksLikeGuid(linkedPhases) ? linkedPhases : "",

    onlinePayment: bool(pick(data, "onlinePayment", ["pagoOnline"]), false),
    inPersonPayment: bool(pick(data, "inPersonPayment", ["pagoPresencial"]), true),
    depositType: text(pick(data, "depositType", ["depositoTipo"])),
    depositAmount: num(pick(data, "depositAmount", ["depositoImporte"]), 0),
    pricingModel: text(pick(data, "pricingModel", ["modeloPrecio"])),

    status: status || CATALOG_STATUS.ACTIVO,
    clientHidden: false,

    // MULTI_REFERENCE: IDs tecnicos sin transformar.
    // availableStaff -> Members (staffMemberId). La conversion a resourceId
    // de Bookings se resuelve en backend, nunca en el frontend.
    availableStaffIds: getReferenceIds(pick(data, "availableStaff", ["staffDisponible"])),
    locationIds: getReferenceIds(pick(data, "locationId", [])),
    recommendationIds: getReferenceIds(pick(data, "recomendaciones", []))
  };

  const dto = {
    serviceId,
    slug,
    title: metadata.title,
    description: metadata.description,
    tagLine: metadata.tagLine,
    location: metadata.location,
    totalDuration: metadata.totalDuration,
    phase1Duration: metadata.phase1Duration,
    phase2Duration: metadata.phase2Duration,
    exposureDuration: metadata.exposureDuration,
    durationRange: metadata.durationRange,
    price: metadata.price,
    currency: metadata.currency,
    mainMedia: mainMedia,
    mainMedia,
    serviceType: metadata.serviceType,
    addons: normalizeAddons(data, sourceMetadata),
    allowCombine: metadata.allowCombine,
    linkedPhases: metadata.linkedPhases,
    onlinePayment: metadata.onlinePayment,
    inPersonPayment: metadata.inPersonPayment,
    depositType: metadata.depositType,
    depositAmount: metadata.depositAmount,
    pricingModel: metadata.pricingModel,
    metadata
  };

  return projectPublicService(dto);
}

/* Lista blanca de salida: garantiza que ningun campo fiscal, de coste o de
 * notas internas (tipoImpositivo, codigoImpuesto, claveRegimen,
 * cuentaContableIngreso/Gasto, costPrice, margin, internalNotes) llegue al
 * widget HTML embebido.
 */
function projectPublicService(dto) {
  const projected = {};

  PUBLICSERVICEFIELDS.forEach((field) => {
    if (dto[field] !== undefined) {
      projected[field] = dto[field];
    }
  });

  return projected;
}

/* ============================================================================
 * RESOLUCION DE IDENTIDAD PUBLICA (slug优先, serviceId tecnico)
  ==========================================================================*/

async function resolveServiceLookup() {
  const query = wixLocation.query || {};

  // Orden canonico: slug (publico) -> serviceId (tecnico Wix).
  // slug queda como alias legacy de lectura (CAMBIO.txt 3, retirada V5010).
  const candidates = [
    query.slug,
    query.serviceId,
    query.slug
  ];

  for (const candidate of candidates) {
    const value = _safeSlugOrId(candidate);
    if (value) {
      return value;
    }
  }

  const path = Array.isArray(wixLocation.path) ? wixLocation.path : [];
  const value = _safeSlugOrId(path[path.length - 1] || "");

  if (!value || EXCLUDEDPATHSEGMENTS.includes(value)) {
    return null;
  }

  return value;
}

/* ============================================================================
 * NAVEGACION A RESERVA
  ==========================================================================*/

function getAddonIds(payload) {
  if (!payload || !Array.isArray(payload.addons)) {
    return [];
  }

  return Array.from(
    new Set(
      payload.addons
        .map((addon) => {
          if (addon && typeof addon === "object") {
            // Canonico: addOnId (ComplementosCatalogo). Legacy: addOnId / id.
            return text(addon.addOnId || addon.nativeId || addon.addOnId || addon.id);
          }
          return text(addon);
        })
        .filter(Boolean)
    )
  ).slice(0, MAXADDONSPOR_RESERVA);
}

function buildBookingUrl(service, payload) {
  const base = text(URLS?.CALENDARIO_2, "/booking-calendar/calendario-2");

  const serviceId = getServiceId(service);
  const slug = getServiceSlug(service);

  const query = [
    slug=${encodeURIComponent(slug)},
    serviceId=${encodeURIComponent(serviceId)},
    "referral=servicio-2"
  ];

  const addOnIds = getAddonIds(payload);

  if (addOnIds.length) {
    query.push(addOnIds=${encodeURIComponent(addOnIds.join(","))});
  }

  return ${base}?${query.join("&")};
}

function getServicesUrl() {
  return text(URLS?.SERVICIOS, "/reserva-online");
}

/* ============================================================================
 * CARGA DEL SERVICIO (delegada al backend: unica ruta de lectura CMS)
  ==========================================================================*/

async function loadService(lookupValue) {
  const result = await getServiceBySlugOrId(lookupValue);

  if (
    !result ||
    result.status !== "SUCCESS" ||
    !result.data ||
    typeof result.data !== "object"
  ) {
    throw new Error(result?.error?.message || "Servicio no encontrado.");
  }

  return normalizeService(result.data);
}

function showError(message) {
  const safeMessage = text(message, "No se pudo cargar el servicio.");

  console.error("[servicio-2] Error:", safeMessage);

  try {
    const banner = $w("#errorBanner");

    if (!banner) {
      return;
    }

    banner.text = Error: ${safeMessage};

    if (typeof banner.show === "function") {
      banner.show();
    }
  } catch (error) {
    console.warn("[servicio-2] No se pudo mostrar el error:", error?.message);
  }
}

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
 * CICLO DE VIDA DE PAGINA
  ==========================================================================*/

$w.onReady(async () => {
  const traceId = makeTraceId("servicio");
  let widget;

  try {
    widget = $w("#htmlWidgetCustomService");
  } catch (error) {
    showError("El widget del servicio no está disponible.");
    return;
  }

  if (
    !widget ||
    typeof widget.postMessage !== "function" ||
    typeof widget.onMessage !== "function"
  ) {
    showError("El widget del servicio no está disponible.");
    return;
  }

  try {
    const lookupValue = await resolveServiceLookup();

    if (!lookupValue) {
      showError("No se pudo localizar el servicio en la URL.");
      return;
    }

    bridge = createWidgetBridge(widget, {
      onContextReady: async () => {
        resolvedService = await loadService(lookupValue);
        return resolvedService;
      },

      onWidgetMessage: async (message) => {
        const type = getMessageType(message);
        const payload = getPayload(message);

        if (!resolvedService) {
          console.warn("[servicio-2] Servicio aún no disponible", { traceId, type });
          return;
        }

        if (type === MESSAGE_TYPES.BOOK) {
          wixLocation.to(buildBookingUrl(resolvedService, payload));
          return;
        }

        if (type === MESSAGE_TYPES.NAV) {
          const target = text(payload.target).toUpperCase();

          if (!target || target === "SERVICIOS") {
            wixLocation.to(getServicesUrl());
          }

          return;
        }

        if (type === MESSAGETYPES.READY || type === MESSAGETYPES.CONTEXT) {
          return;
        }

        console.warn("[servicio-2] Mensaje no soportado", { traceId, type });
      },

      onError: (error) => {
        showError(getSafeMessage(error, "No se pudo cargar el servicio."));
      }
    });

    if (!bridge) {
      showError("No se pudo inicializar el widget del servicio.");
    }
  } catch (error) {
    console.error("[servicio-2] Error de inicialización", {
      traceId,
      message: error?.message
    });

    showError(getSafeMessage(error, "No se pudo cargar el servicio."));
  }
});
