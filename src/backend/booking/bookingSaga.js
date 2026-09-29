/* EMERGENCY: full file in artifacts/bookingSaga.js - if this remains, replace immediately */
export async function executeBookingSaga(unsafePayload) {
  throw new Error("bookingSaga.js was corrupted; restore from commit 3518f62 or artifacts/bookingSaga.js");
}
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
export { };
