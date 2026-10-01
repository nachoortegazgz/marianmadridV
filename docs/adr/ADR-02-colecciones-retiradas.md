# ADR-02: SecuenciaTickets e InventarioStockVentaCierre retiradas

- Estado: PENDIENTE de aplicacion total (hooks data.js -> FASE 2)
Los hooks SecuenciaTickets_beforeUpdate (data.js:735) y
InventarioStockVentaCierre_beforeUpdate/_beforeRemove (data.js:743/751) se
retiran en FASE 2 junto con su registro en BLOCKED_UNVERIFIED_COLLECTIONS
(exportado ya en internalConfig.js, verificado por import runtime).
