/* MODULE: backend/booking/bookingSaga.js VERSION: v5009-FISCAL-V20.4-SAGA restored */
export async function executeBookingSaga(unsafePayload) {
  const { executeBookingSaga: impl } = await import("backend/booking/bookingSaga.impl");
  return impl(unsafePayload);
}
export async function _normalizePersistedMeta(meta) {
  const mod = await import("backend/booking/bookingSaga.impl");
  return mod._normalizePersistedMeta(meta);
}
