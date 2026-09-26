/*
=============================================================================
MODULE: public/widgetBridge.js
VERSION: v5010.2-FISCAL-V20.2
BASE: v5009-FISCAL-V20.1 + listener alignment
RESPONSIBILITY: Secure communication between Velo pages and HTML widgets.
STANDARDS: G10 ASCII Strict.

FIXES:
- SSOT protocol constants.
- Legacy aliases preserved.
- Origin validation.
- Message size limit.
- Message type whitelist.
- Dynamic response type support.
- Safe subscription and unsubscription.
- bridge.reply(message) compatibility.
- No callback reference before bridge initialization.
=============================================================================
*/

// ============================================================================
// PROTOCOL SSOT
// ============================================================================

export const MESSAGETYPES = Object.freeze({
  READY: "MM_READY",
  CONTEXT: "MM_CONTEXT",
  AVAIL: "MM_AVAIL",
  SELECT: "MM_SELECT",
  BOOK: "MM_BOOK",
  NAV: "MM_NAV"
});

export const PROTOCOL_URLS = Object.freeze({
  SERVICIOS: "/reserva-online",
  CALENDARIO_2: "/booking-calendar/calendario-2",
  PRIVACY_POLICY: "/politica-de-privacidad"
});

export const PROTOCOL_UI = Object.freeze({
  FRONTEND_API_TIMEOUT_MS: 60000,
  HANDSHAKE_TIMEOUT_MS: 15000,
  CONTEXT_TIMEOUT_MS: 30000
});

// Legacy aliases.
// These aliases preserve compatibility with existing consumers.
export const MESSAGE_TYPES = MESSAGETYPES;
export const URLS = PROTOCOL_URLS;
export const UI = PROTOCOL_UI;

const DEFAULT_ALLOWED_TYPES = new Set(Object.values(MESSAGETYPES));

const RESPONSE_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,38}_RES$/;

const MAX_MESSAGE_BYTES = 100000;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
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
  } catch (_) {
    return MAX_MESSAGE_BYTES + 1;
  }
}

function isResponseType(type) {
  return RESPONSE_TYPE_PATTERN.test(type);
}

function isAllowedProtocolType(type, allowedTypes) {
  return (
    allowedTypes.has(type) ||
    isResponseType(type) ||
    type === "MM_ADMIN_RESPONSE"
  );
}

// ============================================================================
// BRIDGE FACTORY
// ============================================================================

export function createWidgetBridge(widgetElement, options = {}) {
  if (
    !widgetElement ||
    typeof widgetElement.onMessage !== "function" ||
    typeof widgetElement.postMessage !== "function"
  ) {
    throw new TypeError("A valid HTML Component is required");
  }

  const allowedOrigin = String(options.allowedOrigin || "").trim();

  const allowedTypes = new Set(
    Array.isArray(options.allowedTypes)
      ? options.allowedTypes.map(safeType).filter(Boolean)
      : DEFAULT_ALLOWED_TYPES
  );

  const onError =
    typeof options.onError === "function"
      ? options.onError
      : () => {};

  const onMessage =
    typeof options.onMessage === "function"
      ? options.onMessage
      : () => {};

  const onContextReady =
    typeof options.onContextReady === "function"
      ? options.onContextReady
      : null;

  const onWidgetMessage =
    typeof options.onWidgetMessage === "function"
      ? options.onWidgetMessage
      : null;

  let destroyed = false;
  let sequence = 0;
  let bridge = null;

  const listeners = new Set();

  function fail(code, detail = null) {
    const error = new Error(code);
    error.code = code;

    try {
      onError(error, detail);
    } catch (_) {
      // Ignore consumer error handlers.
    }
  }

  function extractEvent(event) {
    const origin = String(event?.origin || "");

    if (
      allowedOrigin &&
      origin &&
      origin !== allowedOrigin
    ) {
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

    const type = safeType(
      source.type ||
      source.messageType ||
      source.eventType
    );

    if (!isAllowedProtocolType(type, allowedTypes)) {
      return null;
    }

    const payload = safeObject(
      source.payload || source.data
    );

    const messageId = safeMessageId(
      source.messageId || source.id
    );

    return {
      type,
      payload,
      messageId,
      requestId: messageId,
      version: source.version || 1
    };
  }

  function notifyListeners(message) {
    for (const listener of listeners) {
      try {
        listener(message, bridge);
      } catch (error) {
        fail("WIDGET_MESSAGE_LISTENER_FAILED", error);
      }
    }
  }

  function send(
    type,
    payload = {},
    messageId = null
  ) {
    if (destroyed) {
      throw new Error("WIDGET_BRIDGE_DESTROYED");
    }

    const normalizedType = safeType(type);

    if (
      !isAllowedProtocolType(
        normalizedType,
        allowedTypes
      )
    ) {
      throw new Error("WIDGET_MESSAGE_TYPE_NOT_ALLOWED");
    }

    const message = {
      type: normalizedType,
      payload: safeObject(payload),
      messageId:
        safeMessageId(messageId) ||
        `msg-${Date.now().toString(36)}-${(
          ++sequence
        ).toString(36)}`,
      version: 1
    };

    if (estimateSize(message) > MAX_MESSAGE_BYTES) {
      throw new Error("WIDGET_MESSAGE_TOO_LARGE");
    }

    widgetElement.postMessage(message);

    return message.messageId;
  }

  function reply(
    type,
    payload = {},
    requestMessage = null
  ) {
    const requestId =
      requestMessage?.messageId ||
      requestMessage?.requestId ||
      requestMessage?.id ||
      null;

    return send(type, payload, requestId);
  }

  function replyToMessage(
    requestMessage,
    type,
    payload = {}
  ) {
    return reply(type, payload, requestMessage);
  }

  function postMessage(
    payload,
    type = MESSAGETYPES.CONTEXT
  ) {
    return send(type, payload);
  }

  function subscribe(callback) {
    if (
      destroyed ||
      typeof callback !== "function"
    ) {
      return () => {};
    }

    listeners.add(callback);

    return () => {
      listeners.delete(callback);
    };
  }

  const unsubscribeWidget = widgetElement.onMessage(
    (event) => {
      if (destroyed) return;

      try {
        const extracted = extractEvent(event);

        if (!extracted) return;

        const message = normalizeMessage(extracted);

        if (!message) {
          fail("WIDGET_MESSAGE_REJECTED");
          return;
        }

        notifyListeners(message);
        onMessage(message);

        if (onWidgetMessage) {
          onWidgetMessage(message, bridge);
        }

        if (
          message.type === MESSAGETYPES.READY &&
          onContextReady
        ) {
          Promise.resolve(onContextReady(message))
            .then((context) => {
              if (
                context !== undefined &&
                context !== null
              ) {
                send(
                  MESSAGETYPES.CONTEXT,
                  context,
                  message.messageId
                );
              }
            })
            .catch((error) => {
              fail("WIDGET_CONTEXT_FAILED", error);
            });
        }
      } catch (error) {
        fail(
          error?.code ||
            "WIDGET_MESSAGE_HANDLER_FAILED",
          error
        );
      }
    }
  );

  bridge = {
    widget: widgetElement,

    get destroyed() {
      return destroyed;
    },

    origin: allowedOrigin,

    type: "WIX_HTML_COMPONENT_BRIDGE",

    postMessage,

    send,

    reply,

    replyToMessage,

    onMessage: subscribe,

    destroy() {
      if (destroyed) return;

      destroyed = true;
      listeners.clear();

      if (
        typeof unsubscribeWidget === "function"
      ) {
        try {
          unsubscribeWidget();
        } catch (_) {
          // Ignore widget unsubscribe errors.
        }
      }
    }
  };

  return bridge;
}

export default createWidgetBridge;
