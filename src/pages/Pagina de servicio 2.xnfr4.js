/*
=============================================================================
MODULE: pages/servicio-2.js
VERSION: v5010-SERVICE-CATALOG-ALIGNED
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

let bridge = null;
let resolvedService = null;

function text(value, fallback = "") {
  return _safeTrim(value) || fallback;
}

function getSafeMessage(error, fallback) {
  return text(error?.message, fallback);
}

function showError(message) {
  const safeMessage = text(
    message,
    "No se pudo cargar el servicio."
  );

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
    console.warn(
      "[servicio-2] No se pudo mostrar el error:",
      error?.message
    );
  }
}

function getMessageType(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  return text(
    message.type || message.action
  ).toUpperCase();
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

function getReferenceId(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return text(value);
  }

  if (typeof value === "object") {
    return text(
      value.id ||
      value._id ||
      value.referenceId ||
      value.value
    );
  }

  return "";
}

function getServiceId(service) {
  if (!service || typeof service !== "object") {
    return "";
  }

  // Identificador canónico Wix.
  return getReferenceId(service.serviceId);
}

function getServiceSlug(service) {
  if (!service || typeof service !== "object") {
    return "";
  }

  // Campo canónico de ServiciosCatalogo.
  return _safeSlugOrId(service.slug || "");
}

function getServiceImage(service) {
  if (!service || typeof service !== "object") {
    return "";
  }

  const metadata =
    service.metadata &&
    typeof service.metadata === "object"
      ? service.metadata
      : {};

  return text(
    service.mainMedia ||
    service.imageUrl ||
    metadata.mainMedia ||
    metadata.imageUrl
  );
}

function normalizeService(data) {
  const serviceId = getServiceId(data);
  const slug = getServiceSlug(data);
  const imageUrl = getServiceImage(data);

  if (!_looksLikeGuid(serviceId)) {
    throw new Error(
      "El servicio no tiene un serviceId válido."
    );
  }

  if (!slug) {
    throw new Error(
      "El servicio no tiene un slug válido."
    );
  }

  const sourceMetadata =
    data.metadata &&
    typeof data.metadata === "object"
      ? data.metadata
      : {};

  const metadata = {
    ...sourceMetadata,

    title: text(
      data.title ||
      sourceMetadata.title
    ),

    description: text(
      data.description ||
      sourceMetadata.description
    ),

    location: text(
      data.location ||
      sourceMetadata.location
    ),

    totalDuration:
      data.totalDuration ??
      sourceMetadata.totalDuration ??
      0,

    price:
      data.price ??
      sourceMetadata.price ??
      0,

    mainMedia: imageUrl,
    imageUrl,

    allowCombine:
      data.allowCombine ??
      sourceMetadata.allowCombine ??
      false,

    phase2ServiceId: getReferenceId(
      data.linkedPhases ||
      sourceMetadata.linkedPhases
    )
  };

  return {
    serviceId,
    slug,
    title: metadata.title,
    description: metadata.description,
    location: metadata.location,
    totalDuration: metadata.totalDuration,
    price: metadata.price,
    mainMedia: imageUrl,
    imageUrl,

    addons: Array.isArray(data.addOnOptions)
      ? data.addOnOptions
      : Array.isArray(sourceMetadata.addOnOptions)
        ? sourceMetadata.addOnOptions
        : [],

    allowCombine: metadata.allowCombine,
    phase2ServiceId: metadata.phase2ServiceId,
    metadata
  };
}

async function resolveServiceLookup() {
  const query = wixLocation.query || {};

  const candidates = [
    query.slug,
    query.slugUrl,
    query.serviceId
  ];

  for (const candidate of candidates) {
    const value = _safeSlugOrId(candidate);

    if (value) {
      return value;
    }
  }

  const path = Array.isArray(wixLocation.path)
    ? wixLocation.path
    : [];

  const value = _safeSlugOrId(
    path[path.length - 1] || ""
  );

  const excludedPaths = new Set([
    "servicios",
    "service",
    "servicio",
    "servicio-2"
  ]);

  if (!value || excludedPaths.has(value)) {
    return null;
  }

  return value;
}

function getAddonIds(payload) {
  if (!payload || !Array.isArray(payload.addons)) {
    return [];
  }

  return Array.from(
    new Set(
      payload.addons
        .map((addon) => {
          if (addon && typeof addon === "object") {
            return addon.addonId || addon.id || "";
          }

          return addon || "";
        })
        .map((value) => text(value))
        .filter(Boolean)
    )
  ).slice(0, 21);
}

function buildBookingUrl(service, payload) {
  const base = text(
    URLS?.CALENDARIO_2,
    "/booking-calendar/calendario-2"
  );

  const serviceId = getServiceId(service);
  const slug = getServiceSlug(service);

  const query = [
    `slug=${encodeURIComponent(slug)}`,
    `serviceId=${encodeURIComponent(serviceId)}`,
    "referral=servicio-2"
  ];

  const addonIds = getAddonIds(payload);

  if (addonIds.length) {
    query.push(
      `addonIds=${encodeURIComponent(addonIds.join(","))}`
    );
  }

  return `${base}?${query.join("&")}`;
}

function getServicesUrl() {
  return text(
    URLS?.SERVICIOS,
    "/reserva-online"
  );
}

async function loadService(lookupValue) {
  const result = await getServiceBySlugOrId(lookupValue);

  if (
    !result ||
    result.status !== "SUCCESS" ||
    !result.data ||
    typeof result.data !== "object"
  ) {
    throw new Error(
      result?.error?.message ||
      "Servicio no encontrado."
    );
  }

  return normalizeService(result.data);
}

$w.onReady(async () => {
  const traceId = makeTraceId("servicio");
  let widget;

  try {
    widget = $w("#htmlWidgetCustomService");
  } catch (error) {
    showError(
      "El widget del servicio no está disponible."
    );
    return;
  }

  if (
    !widget ||
    typeof widget.postMessage !== "function" ||
    typeof widget.onMessage !== "function"
  ) {
    showError(
      "El widget del servicio no está disponible."
    );
    return;
  }

  try {
    const lookupValue = await resolveServiceLookup();

    if (!lookupValue) {
      showError(
        "No se pudo localizar el servicio en la URL."
      );
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
          console.warn(
            "[servicio-2] Servicio aún no disponible",
            { traceId, type }
          );
          return;
        }

        if (type === MESSAGE_TYPES.BOOK) {
          wixLocation.to(
            buildBookingUrl(
              resolvedService,
              payload
            )
          );
          return;
        }

        if (type === MESSAGE_TYPES.NAV) {
          const target = text(
            payload.target
          ).toUpperCase();

          if (
            !target ||
            target === "SERVICIOS"
          ) {
            wixLocation.to(
              getServicesUrl()
            );
          }

          return;
        }

        if (
          type === MESSAGE_TYPES.READY ||
          type === MESSAGE_TYPES.CONTEXT
        ) {
          return;
        }

        console.warn(
          "[servicio-2] Mensaje no soportado",
          { traceId, type }
        );
      },

      onError: (error) => {
        showError(
          getSafeMessage(
            error,
            "No se pudo cargar el servicio."
          )
        );
      }
    });

    if (!bridge) {
      showError(
        "No se pudo inicializar el widget del servicio."
      );
    }
  } catch (error) {
    console.error(
      "[servicio-2] Error de inicialización",
      {
        traceId,
        message: error?.message
      }
    );

    showError(
      getSafeMessage(
        error,
        "No se pudo cargar el servicio."
      )
    );
  }
});
