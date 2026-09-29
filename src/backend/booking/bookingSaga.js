/*
MODULE: backend/booking/bookingSaga.js
VERSION: v5009-FISCAL-V20.4-SAGA-PENDING-RESTORE
NOTE: Full module (~70KB) could not be auto-pushed in one API call.
Apply from package marianmadridV_fixes.zip -> src/backend/booking/bookingSaga.js
Includes: simple + dual gap (NOT Multi Service), selectedPaymentOption ONLINE, compensation.
*/

export function _normalizePersistedMeta(meta) {
  if (!meta) return {};
  try {
    if (typeof meta === "string") {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
    return typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  } catch (_) {
    return {};
  }
}

export class BookingSagaOrchestrator {
  constructor(traceId) {
    this.traceId = traceId;
    this.steps = [];
    this.completedSteps = [];
  }
  addStep(name, executeFn, compensateFn) {
    this.steps.push({ name, executeFn, compensateFn });
  }
  async execute() {
    throw new Error(
      "bookingSaga.js PENDING RESTORE: replace this file with the full module from marianmadridV_fixes.zip"
    );
  }
}

export async function executeBookingSaga(unsafePayload) {
  return {
    status: "ERROR",
    data: null,
    error: {
      code: "SAGA_PENDING_RESTORE",
      message:
        "bookingSaga.js is a stub. Apply full file from marianmadridV_fixes.zip (src/backend/booking/bookingSaga.js), commit, push, then Wix Git Sync + Publish.",
    },
  };
}
