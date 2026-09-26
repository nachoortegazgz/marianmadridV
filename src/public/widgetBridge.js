/*
=============================================================================
MODULE: public/widgetBridge.js
VERSION: v5009-FISCAL-V20.1
BASE: v5007.5-FUNCTIONAL + revision revisada
RESPONSIBILITY: Comunicacion segura entre paginas Velo y widgets HTML.
STANDARDS: G10 ASCII Strict.

FIXES APLICADOS v5009-FISCAL-V20.1:
  - V20-01: cabecera actualizada.
  - V20-02: revision revisada. Anade validacion de origen, limite de
            tamano de mensaje, whitelist de tipos, y desuscripcion segura.
  - V20-03: onWidgetMessage recibe (message, bridge). Los consumidores
            antiguos que esperaban (message, reply) deben actualizarse a
            bridge.reply(...) o bridge.send(...).

FIXES APLICADOS v5010.1-PUBLIC-ALIGN:
  - FIX-PUB-03: MESSAGETYPES/PROTOCOL_URLS/PROTOCOL_UI exportados como SSOT
    unico del protocolo; DEFAULT_ALLOWED_TYPES derivado de MESSAGETYPES.
  - FIX-PUB-09: isAllowedType(): ademas de la whitelist explicita, se
    aceptan los tipos de respuesta por contrato de pagina (<TYPE>_RES) y
    MM_ADMIN_RESPONSE. Elimina WB-B01 residual (respuestas reales eran
    rechazadas por send()).
  - NOTA CERRADA: calendario-2/servicio-2 ya usan bridge.reply (FASE7).
=============================================================================
*/

// =============================================================================
// PROTOCOLO SSOT (FIX-PUB-03): widgetBridge es la unica fuente de verdad.
// MESSAGETYPES define los tipos canonicos MM_*; DEFAULT_ALLOWED_TYPES se
// deriva de el (WB-B01: whitelist == tipos reales del protocolo).
// =============================================================================

export const MESSAGETYPES = Object.freeze({
  READY: "MM_READY",
  CONTEXT: "MM_CONTEXT",
  AVAIL: "MM_AVAIL",
  SELECT: "MM_SELECT",
  BOOK: "MM_BOOK",
  NAV: "MM_NAV",
});

export const PROTOCOL_URLS = Object.freeze({
  SERVICIOS: "/reserva-online",
  CALENDARIO_2: "/booking-calendar/calendario-2",
  PRIVACY_POLICY: "/politica-de-privacidad",
});

export const PROTOCOL_UI = Object.freeze({
  FRONTEND_API_TIMEOUT_MS: 60000,
  HANDSHAKE_TIMEOUT_MS: 15000,
  CONTEXT_TIMEOUT_MS: 30000,
});

const DEFAULT_ALLOWED_TYPES = new Set(Object.values(MESSAGETYPES));

// Respuestas de accion por pagina (suffix _RES): tipos dinamicos derivados
// del tipo peticion. Se whitelistan automaticamente con el mismo patron que
// los tipos canonicos, evitando WB-B01 (whitelist != tipos reales).
const RESPONSE_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,38}_RES$/;

const MAX_MESSAGE_BYTES = 100000;

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeType(value) {
  const type = String(value || "")
    .trim()
    .toUpperCase();
  return type.slice(0, 40);
}

function safeMessageId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "_")
    .slice(0, 120);
}

function estimateSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return MAX_MESSAGE_BYTES + 1;
  }
}

export function createWidgetBridge(widgetElement, options = {}) {
  if (
    !widgetElement ||
    typeof widgetElement.onMessage !== "function" ||
    typeof widgetElement.postMessage !== "function"
  ) {
    throw new TypeError("A valid HTML Component is required");
  }

  const allowedOrigin = String(options.allowedOrigin || "").trim();
  const allowedTypes = new Set(options.allowedTypes || DEFAULT_ALLOWED_TYPES);

  function isAllowedType(type) {
    return (
      allowedTypes.has(type) ||
      RESPONSE_TYPE_PATTERN.test(type) ||
      type === "MM_ADMIN_RESPONSE"
    );
  }
  const onError =
    typeof options.onError === "function" ? options.onError : () => {};
  const onMessage =
    typeof options.onMessage === "function" ? options.onMessage : () => {};
  const onContextReady =
    typeof options.onContextReady === "function" ? options.onContextReady : null;
  const onWidgetMessage =
    typeof options.onWidgetMessage === "function"
      ? options.onWidgetMessage
      : null;

  let destroyed = false;
  let sequence = 0;

  function fail(code, detail = null) {
    const error = new Error(code);
    error.code = code;
    try {
      onError(error, detail);
    } catch (_) {}
  }

  function extractEvent(event) {
    const origin = String(event?.origin || "");
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      fail("WIDGET_ORIGIN_REJECTED", { origin });
      return null;
    }

    const message = safeObject(event?.data);
    if (estimateSize(message) > MAX_MESSAGE_BYTES) {
      fail("WIDGET_MESSAGE_TOO_LARGE");
      return null;
    }

    return message;
  }

  function normalizeMessage(message) {
    const source = safeObject(message);
    const type = safeType(source.type || source.messageType || source.eventType);

    if (!isAllowedType(type)) return null;

    const payload = safeObject(source.payload || source.data);
    const messageId = safeMessageId(source.messageId || source.id);

    return {
      type,
      payload,
      messageId,
      requestId: messageId,
      version: source.version || 1,
    };
  }

  function send(type, payload = {}, messageId = null) {
    if (destroyed) throw new Error("WIDGET_BRIDGE_DESTROYED");

    const normalizedType = safeType(type);
    if (!isAllowedType(normalizedType)) {
      throw new Error("WIDGET_MESSAGE_TYPE_NOT_ALLOWED");
    }

    const message = {
      type: normalizedType,
      payload: safeObject(payload),
      messageId:
        safeMessageId(messageId) ||
        `msg-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
      version: 1,
    };

    if (estimateSize(message) > MAX_MESSAGE_BYTES) {
      throw new Error("WIDGET_MESSAGE_TOO_LARGE");
    }

    widgetElement.postMessage(message);
    return message.messageId;
  }

  function reply(type, payload, requestMessage) {
    return send(
      type,
      payload,
      requestMessage?.messageId || requestMessage?.requestId || null
    );
  }

  function postMessage(payload, type = "MM_CONTEXT") {
    return send(type, payload);
  }

  const unsubscribe = widgetElement.onMessage((event) => {
    if (destroyed) return;

    try {
      const message = normalizeMessage(extractEvent(event));

      if (!message) {
        fail("WIDGET_MESSAGE_REJECTED");
        return;
      }

      onMessage(message);

      if (onWidgetMessage) onWidgetMessage(message, bridge);

      if (message.type === "MM_READY" && onContextReady) {
        Promise.resolve(onContextReady(message))
          .then((context) => {
            if (context !== undefined && context !== null) {
              send("MM_CONTEXT", context, message.messageId);
            }
          })
          .catch((error) => fail("WIDGET_CONTEXT_FAILED", error));
      }
    } catch (error) {
      fail(error?.code || "WIDGET_MESSAGE_HANDLER_FAILED", error);
    }
  });

  const bridge = {
    widget: widgetElement,

    get destroyed() {
      return destroyed;
    },

    origin: allowedOrigin,
    type: "WIX_HTML_COMPONENT_BRIDGE",

    postMessage,
    send,
    reply,

    onMessage(callback) {
      return typeof callback === "function" ? callback : () => {};
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (_) {}
      }
    },
  };

  return bridge;
}

export default createWidgetBridge;