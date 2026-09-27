/**
 * MODULE: pages/calendario-2.js
 * VERSION: v5010-SERVICE-CATALOG-ALIGNED
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
import { processDualBooking } from "backend/citasManager.web";

let currentServiceId = "";
let currentSlug = "";
let currentService = null;
let bridge = null;

function parseUrlParams() {
  const query = wixLocation.query || {};

  return {
    serviceId: _safeTrim(query.serviceId || ""),
    slug: _safeSlugOrId(
      query.slug ||
      query.slugUrl ||
      ""
    ),
    referral: _safeTrim(query.referral || ""),
    addonIds: _safeTrim(query.addonIds || "")
      .split(",")
      .map(_safeTrim)
      .filter(Boolean)
  };
}

function resolveServiceFromParams(params) {
  const serviceId = _safeTrim(params.serviceId);
  const slug = _safeSlugOrId(params.slug);

  if (serviceId && _looksLikeGuid(serviceId)) {
    return {
      serviceId,
      slug: slug || ""
    };
  }

  if (slug) {
    return {
      serviceId: "",
      slug
    };
  }

  return null;
}

function getMessageType(message) {
  return _safeTrim(
    message?.type ||
    message?.action ||
    ""
  ).toUpperCase();
}

function getPayload(message) {
  if (
    message?.payload &&
    typeof message.payload === "object" &&
    !Array.isArray(message.payload)
  ) {
    return message.payload;
  }

  return {};
}

function createResultError(code, message) {
  return {
    status: "ERROR",
    data: null,
    error: {
      code,
      message
    }
  };
}

function getReferenceId(value) {
  if (typeof value === "string") {
    return _safeTrim(value);
  }

  if (value && typeof value === "object") {
    return _safeTrim(
      value.id ||
      value._id ||
      value.referenceId ||
      value.value ||
      ""
    );
  }

  return "";
}

function getActiveServiceLookup() {
  return (
    currentService?.serviceId ||
    currentService?.slug ||
    currentServiceId ||
    currentSlug
  );
}

function filterAllowedAddonIds(service, requestedIds) {
  if (!Array.isArray(requestedIds)) {
    return [];
  }

  const addons = Array.isArray(service?.addons)
    ? service.addons
    : Array.isArray(service?.metadata?.addOnOptions)
      ? service.metadata.addOnOptions
      : [];

  const allowed = new Set();

  for (const addon of addons) {
    const id = getReferenceId(
      typeof addon === "string"
        ? addon
        : addon?.addonId ||
          addon?.id ||
          addon?.referenceId
    );

    if (id) {
      allowed.add(id);
    }
  }

  return Array.from(
    new Set(
      requestedIds
        .map(_safeTrim)
        .filter((id) => id && allowed.has(id))
    )
  ).slice(0, 21);
}

function normalizeService(data, params) {
  const sourceMetadata =
    data.metadata &&
    typeof data.metadata === "object"
      ? data.metadata
      : {};

  const serviceId = getReferenceId(data.serviceId);

  const slug = _safeSlugOrId(
    data.slug ||
    params.slug ||
    currentSlug
  );

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

  const imageUrl = _safeTrim(
    data.mainMedia ||
    data.imageUrl ||
    sourceMetadata.mainMedia ||
    sourceMetadata.imageUrl ||
    ""
  );

  const addons = Array.isArray(data.addOnOptions)
    ? data.addOnOptions
    : Array.isArray(sourceMetadata.addOnOptions)
      ? sourceMetadata.addOnOptions
      : [];

  return {
    ...data,

    serviceId,
    slug,

    title: _safeTrim(
      data.title ||
      sourceMetadata.title ||
      ""
    ),

    description: _safeTrim(
      data.description ||
      sourceMetadata.description ||
      ""
    ),

    location: _safeTrim(
      data.location ||
      sourceMetadata.location ||
      ""
    ),

    totalDuration: Number(
      data.totalDuration ??
      sourceMetadata.totalDuration ??
      0
    ),

    price: Number(
      data.price ??
      sourceMetadata.price ??
      0
    ),

    mainMedia: imageUrl,
    imageUrl,
    addons,

    allowCombine:
      data.allowCombine === true ||
      sourceMetadata.allowCombine === true,

    phase2ServiceId: getReferenceId(
      data.phase2ServiceId ||
      data.linkedPhases ||
      sourceMetadata.phase2ServiceId ||
      sourceMetadata.linkedPhases
    ),

    clientHidden:
      data.clientHidden === true,

    metadata: {
      ...sourceMetadata,
      title: _safeTrim(
        data.title ||
        sourceMetadata.title ||
        ""
      ),
      mainMedia: imageUrl,
      imageUrl,
      addOnOptions: addons
    },

    referral: params.referral,
    preselectedAddonIds: params.addonIds,
    timeZone: "Europe/Madrid",
    currencyCode: _safeTrim(
      data.currency ||
      sourceMetadata.currency ||
      "EUR"
    ).toUpperCase()
  };
}

async function loadServiceContext(params) {
  const lookup =
    currentServiceId ||
    currentSlug;

  const result = await getServiceBySlugOrId(lookup);

  if (
    !result ||
    result.status !== "SUCCESS" ||
    !result.data ||
    typeof result.data !== "object"
  ) {
    throw new Error(
      result?.error?.message ||
      "No se pudo cargar el servicio."
    );
  }

  currentService = normalizeService(
    result.data,
    params
  );

  currentServiceId = currentService.serviceId;
  currentSlug = currentService.slug;

  return currentService;
}

async function handleNavigation(payload) {
  const target = _safeTrim(
    payload?.target || ""
  ).toUpperCase();

  if (target === "SERVICIOS") {
    wixLocation.to(
      URLS?.SERVICIOS ||
      "/reserva-online"
    );
    return;
  }

  if (target === "PRIVACY") {
    wixLocation.to(
      URLS?.PRIVACY_POLICY ||
      "/politica-de-privacidad"
    );
  }
}

async function handleAvailability(
  payload,
  bridge,
  requestMessage
) {
  if (!currentService) {
    bridge.reply(
      MESSAGE_TYPES.AVAIL,
      createResultError(
        "SERVICE_CONTEXT_NOT_READY",
        "El servicio todavía se está cargando."
      ),
      requestMessage
    );
    return;
  }

  const action = _safeTrim(
    payload.action || ""
  ).toLowerCase();

  const addonIds = filterAllowedAddonIds(
    currentService,
    payload.addonIds
  );

  const lookup = getActiveServiceLookup();
  const timeout =
    UI?.FRONTEND_API_TIMEOUT_MS || 60000;

  try {
    let result;

    if (action === "days") {
      result = await withTimeout(
        () => getAvailableDays(
          lookup,
          payload.resourceId || null,
          Number(payload.year),
          Number(payload.month),
          addonIds
        ),
        timeout,
        "getAvailableDays"
      );
    } else if (action === "slots") {
      const dateYMD = _safeTrim(
        payload.dateYMD || ""
      );

      result = await withTimeout(
        () => currentService.allowCombine
          ? getCertifiedDualSlots(
              lookup,
              payload.resourceId || null,
              dateYMD,
              addonIds
            )
          : getAvailableSlots(
              lookup,
              payload.resourceId || null,
              dateYMD,
              addonIds
            ),
        timeout,
        currentService.allowCombine
          ? "getCertifiedDualSlots"
          : "getAvailableSlots"
      );
    } else {
      result = createResultError(
        "INVALID_AVAILABILITY_REQUEST",
        "Solicitud de disponibilidad no válida."
      );
    }

    bridge.reply(
      MESSAGE_TYPES.AVAIL,
      {
        ...(result || createResultError(
          "EMPTY_AVAILABILITY_RESPONSE",
          "No se recibió disponibilidad."
        )),
        requestSequence:
          payload.requestSequence || 0
      },
      requestMessage
    );
  } catch (error) {
    bridge.reply(
      MESSAGE_TYPES.AVAIL,
      createResultError(
        "AVAILABILITY_FAILED",
        "No se pudo obtener disponibilidad."
      ),
      requestMessage
    );
  }
}

async function handleSelection(
  payload,
  bridge,
  requestMessage
) {
  if (!currentService) {
    bridge.reply(
      MESSAGE_TYPES.SELECT,
      createResultError(
        "SERVICE_CONTEXT_NOT_READY",
        "El servicio todavía se está cargando."
      ),
      requestMessage
    );
    return;
  }

  const start = _safeTrim(
    payload.localStartDate ||
    payload.slotF1?.localStartDate ||
    ""
  );

  const end = _safeTrim(
    payload.localEndDate ||
    payload.slotF1?.localEndDate ||
    ""
  );

  if (!start || !end) {
    bridge.reply(
      MESSAGE_TYPES.SELECT,
      createResultError(
        "INVALID_SLOT",
        "El intervalo seleccionado no es válido."
      ),
      requestMessage
    );
    return;
  }

  const addonIds = filterAllowedAddonIds(
    currentService,
    payload.addonIds
  );

  try {
    const result = await withTimeout(
      () => resolveStaffForSlot(
        getActiveServiceLookup(),
        start,
        payload.resourceId || null,
        addonIds,
        end
      ),
      UI?.FRONTEND_API_TIMEOUT_MS || 60000,
      "resolveStaffForSlot"
    );

    bridge.reply(
      MESSAGE_TYPES.SELECT,
      result || createResultError(
        "STAFF_RESOLVE_FAILED",
        "No se pudo validar el profesional."
      ),
      requestMessage
    );
  } catch (error) {
    bridge.reply(
      MESSAGE_TYPES.SELECT,
      createResultError(
        "STAFF_RESOLVE_FAILED",
        "No se pudo validar el profesional."
      ),
      requestMessage
    );
  }
}

async function handleBooking(
  message,
  bridge,
  traceId
) {
  const payload = getPayload(message);

  if (!currentService) {
    bridge.reply(
      MESSAGE_TYPES.BOOK,
      createResultError(
        "SERVICE_CONTEXT_NOT_READY",
        "El servicio todavía se está cargando."
      ),
      message
    );
    return;
  }

  const bookingData =
    payload.bookingData &&
    typeof payload.bookingData === "object"
      ? payload.bookingData
      : message;

  if (
    !bookingData ||
    typeof bookingData !== "object"
  ) {
    bridge.reply(
      MESSAGE_TYPES.BOOK,
      createResultError(
        "INVALID_BOOKING_PAYLOAD",
        "Los datos de la reserva no son válidos."
      ),
      message
    );
    return;
  }

  if (currentService.allowCombine) {
    const f2 = bookingData.slotF2;

    if (
      !f2 ||
      !_safeTrim(f2.localStartDate) ||
      !_safeTrim(f2.localEndDate)
    ) {
      bridge.reply(
        MESSAGE_TYPES.BOOK,
        createResultError(
          "INVALID_DUAL_SLOT",
          "Falta el horario de la segunda fase."
        ),
        message
      );
      return;
    }
  }

  const addonIds = filterAllowedAddonIds(
    currentService,
    bookingData.addonIds
  );

  const requestPayload = {
    ...bookingData,

    // Identidades canónicas protegidas.
    serviceId: currentService.serviceId,
    slug: currentService.slug,

    addonIds,
    traceId
  };

  try {
    const result = await withTimeout(
      () => processDualBooking(requestPayload),
      UI?.FRONTEND_API_TIMEOUT_MS || 60000,
      "processDualBooking"
    );

    const bookingResult =
      result ||
      createResultError(
        "EMPTY_BOOKING_RESPONSE",
        "No se recibió respuesta de la reserva."
      );

    bridge.reply(
      MESSAGE_TYPES.BOOK,
      bookingResult,
      message
    );

    if (
      bookingResult.status === "SUCCESS" ||
      bookingResult.success === true
    ) {
      await wixWindow.openLightbox(
        "ConfirmacionReserva",
        bookingResult.data ||
        bookingResult
      );
    }
  } catch (error) {
    bridge.reply(
      MESSAGE_TYPES.BOOK,
      createResultError(
        "BOOKING_FAILED",
        "No se pudo completar la reserva."
      ),
      message
    );
  }
}

$w.onReady(async () => {
  const traceId = makeTraceId("calendario");
  const params = parseUrlParams();
  const resolved = resolveServiceFromParams(params);

  if (!resolved) {
    console.error(
      "[calendario-2] Identidad de servicio inválida",
      { traceId }
    );
    return;
  }

  currentServiceId = resolved.serviceId;
  currentSlug = resolved.slug;

  const widget = $w(
    "#htmlWidgetCalendario"
  );

  if (
    !widget ||
    typeof widget.postMessage !== "function" ||
    typeof widget.onMessage !== "function"
  ) {
    console.error(
      "[calendario-2] Widget HTML no disponible",
      { traceId }
    );
    return;
  }

  try {
    bridge = createWidgetBridge(widget, {
      onContextReady: () =>
        loadServiceContext(params),

      onWidgetMessage: async (
        message,
        widgetBridge
      ) => {
        const type = getMessageType(message);
        const payload = getPayload(message);

        if (type === MESSAGE_TYPES.NAV) {
          await handleNavigation(payload);
          return;
        }

        if (type === MESSAGE_TYPES.AVAIL) {
          await handleAvailability(
            payload,
            widgetBridge,
            message
          );
          return;
        }

        if (type === MESSAGE_TYPES.SELECT) {
          await handleSelection(
            payload,
            widgetBridge,
            message
          );
          return;
        }

        if (type === MESSAGE_TYPES.BOOK) {
          await handleBooking(
            message,
            widgetBridge,
            traceId
          );
          return;
        }

        if (
          type !== MESSAGE_TYPES.READY &&
          type !== MESSAGE_TYPES.CONTEXT
        ) {
          console.warn(
            "[calendario-2] Mensaje no soportado",
            { traceId, type }
          );
        }
      },

      onError: (error) => {
        console.error(
          "[calendario-2] Error de comunicación",
          {
            traceId,
            message: error?.message
          }
        );
      }
    });

    if (!bridge) {
      throw new Error(
        "No se pudo inicializar el bridge."
      );
    }
  } catch (error) {
    console.error(
      "[calendario-2] Error de inicialización",
      {
        traceId,
        message: error?.message
      }
    );
  }
});
