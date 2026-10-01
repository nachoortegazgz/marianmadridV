# ADR-05: MEMBERSHIP en normalizeWixPaymentMethod (FASE 2)

- Estado: PROPUESTO (a aplicar con validation.js)
MEMBERSHIP no puede persistirse como metodo real. Decision propuesta: mapear a
TRANSFERENCIA + log.warn con origen WIX_MEMBERSHIP, hasta confirmacion del
negocio. OFFLINE indeterminable -> EFECTIVO + log.warn (nunca persistir OFFLINE).
