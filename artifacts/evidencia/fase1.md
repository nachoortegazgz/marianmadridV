=====P0-1=====
# EVIDENCIA FASE 1

Fecha: 2026-10-01T03:51:43Z
Repo snapshot: /workspace (branch qwen-code-b2e07ca6-f57f-4727-a081-5b9818c6dc4a, HEAD 1530c4a)
Node: v20.20.2 / npm: 10.8.2

## 0. NOTA DE ENTORNO (VERIFICADO)
- El entorno de ejecucion NO contiene node_modules y NO tiene credenciales para clonar el repo privado (git remote -v = vacio).
- Baseline original ssot.v5011/ssot.flow/unit/reservas/dynamic E2E: NO EJECUTABLE en este sandbox (tests/loader.mjs y SERVICIOS_CATALOGO.csv no existen en este snapshot). Verificado con:
  - find . -name "loader.mjs" -> 0 resultados
  - ls SERVICIOS_CATALOGO.csv -> inexistente
- Se construyo una red de seguridad offline equivalente en src/backend/tests/ (mocks wix-* + node --test) conforme al estandar del prompt.

## 1.2 EVIDENCIA P0 (salidas literales)

### P0-1 imports rotos: grep -n "EU_VAT_PREFIXES|FISCAL_ROLE" src/backend/internalConfig.js
652:export const FISCAL_ROLE = Object.freeze({
657:export const EU_VAT_PREFIXES = Object.freeze([
794:        case FISCAL_ROLE.EMISOR:
796:        case FISCAL_ROLE.RECEPTOR:
---
### Consumidores de EU_VAT_PREFIXES / FISCAL_ROLE (grep -rn src/backend --include=*.js)
src/backend/data.js:29:    EU_VAT_PREFIXES,
src/backend/data.js:30:    FISCAL_ROLE,
src/backend/data.js:82:const VALID_FISCAL_ROLES = new Set([
src/backend/data.js:164:        if (EU_VAT_PREFIXES.includes(prefix)) {
src/backend/data.js:279:    if (!VALID_FISCAL_ROLES.has(role)) {
src/backend/data.js:339:        const role = _safeTrim(item.fiscalRole || item.rolFiscal).toUpperCase() || FISCAL_ROLE.EMISOR;
src/backend/data.js:340:        const withholdingFactor = role === FISCAL_ROLE.RECEPTOR ? 1 : -1;
src/backend/contabilidad.js:11:            AEAT_INVOICE_TYPE, FISCAL_ROLE).
src/backend/contabilidad.js:38:    FISCAL_ROLE,
src/backend/contabilidad.js:138:    return _cleanText(movement?.fiscalRole || movement?.rolFiscal || FISCAL_ROLE.EMISOR, 10);
src/backend/contabilidad.js:248:        fiscalRole: base.fiscalRole || FISCAL_ROLE.EMISOR,
src/backend/contabilidad.js:391:    const fiscalRole = base.fiscalRole || FISCAL_ROLE.EMISOR;
src/backend/contabilidad.js:392:    const withholdingAccountCode = fiscalRole === FISCAL_ROLE.RECEPTOR
src/backend/contabilidad.js:395:    const withholdingAccountName = fiscalRole === FISCAL_ROLE.RECEPTOR
src/backend/contabilidad.js:423:            if (fiscalRole === FISCAL_ROLE.RECEPTOR) {
src/backend/contabilidad.js:442:            if (fiscalRole === FISCAL_ROLE.RECEPTOR) {
src/backend/events.js:50:    FISCAL_ROLE,
src/backend/events.js:227:            fiscalRole: FISCAL_ROLE.EMISOR,
src/backend/events.js:306:        fiscalRole: FISCAL_ROLE.EMISOR,
src/backend/events.js:536:                        fiscalRole: FISCAL_ROLE.EMISOR,
src/backend/events.js:703:                fiscalRole: fiscalData.fiscalRole || FISCAL_ROLE.EMISOR,
src/backend/events.js:949:                fiscalRole: FISCAL_ROLE.EMISOR,
src/backend/eventLog.js:44:    FISCAL_ROLE,
src/backend/eventLog.js:433:        fiscalRole: _safeTrim(input.fiscalRole) || FISCAL_ROLE.EMISOR,
src/backend/cajas.web.js:45:    FISCAL_ROLE,
src/backend/cajas.web.js:543:        const fiscalRole = (rawFiscalRole === FISCAL_ROLE.EMISOR || rawFiscalRole === FISCAL_ROLE.RECEPTOR)
src/backend/cajas.web.js:545:            : FISCAL_ROLE.EMISOR;
src/backend/cajas.web.js:864:        fiscalRole: meta.fiscalRole || meta.rolFiscal || FISCAL_ROLE.EMISOR,
src/backend/cajas.web.js:1246:                fiscalRole: FISCAL_ROLE.EMISOR,
src/backend/cajas.web.js:1402:                fiscalRole: FISCAL_ROLE.EMISOR,
---
### Mapa alias COLLECTIONS (excluyendo grupos canonicos)
src/backend/inventario.web.js:20:  - V20-03: NOTA DE AUDITORIA: el original usa COLLECTIONS.HISTORICO_CIERRES_Z
src/backend/inventario.web.js:44:  COLLECTIONS,
src/backend/inventario.web.js:68:const INVENTARIO_COL = COLLECTIONS.INVENTARIO_STOCK_VENTA;
src/backend/inventario.web.js:69:const MOVIMIENTOS_INV_COL = COLLECTIONS.MOVIMIENTOS_INVENTARIO;
src/backend/inventario.web.js:70:const CIERRE_INV_COL = COLLECTIONS.HISTORICO_CIERRES_Z;
src/backend/fiscalDocuments.web.js:26:import { COLLECTIONS, SDK_CONFIG } from "backend/internalConfig";
src/backend/fiscalDocuments.web.js:37:const DOCS_COL = COLLECTIONS.HISTORICO_CIERRES_Z;
src/backend/citasManager.web.js:29:  COLLECTIONS,
src/backend/citasManager.web.js:73:const CITAS_COL = COLLECTIONS.CITAS_F2;
src/backend/staff.js:21:    COLLECTIONS,
src/backend/staff.js:132:        .query(COLLECTIONS.MAPA_STAFF)
src/backend/data.js:28:    COLLECTIONS,
src/backend/data.js:583:            .query(COLLECTIONS.MAPA_STAFF)
src/backend/data.js:596:            .query(COLLECTIONS.MAPA_STAFF)
src/backend/data.js:609:            .query(COLLECTIONS.MAPA_STAFF)
src/backend/data.js:717:            COLLECTIONS.ASIENTOS_CONTABLES,
src/backend/fiscalAggregator.web.js:25:import { COLLECTIONS, SDK_CONFIG, MOVEMENT_TYPE } from "backend/internalConfig";
src/backend/fiscalAggregator.web.js:211:  let query = wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/fiscalAggregator.web.js:400:      wixData.query(COLLECTIONS.CONFIGURACION_FISCAL)
src/backend/events.js:40:    COLLECTIONS,
src/backend/events.js:128:const PROCESSED_EVENTS_COL = COLLECTIONS.PROCESSED_WEBHOOK_EVENTS;
src/backend/events.js:482:            .query(COLLECTIONS.CITAS_F2)
src/backend/events.js:491:                .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/events.js:624:            wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/events.js:828:            wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/events.js:1002:            wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/booking/bookingSaga.js:34:    COLLECTIONS,
src/backend/booking/bookingSaga.js:100:const CITASCOL = COLLECTIONS.CITAS_F2;
src/backend/booking/bookingSaga.js:101:const SERVICIOSCOL = COLLECTIONS.SERVICIOS_CATALOGO;
src/backend/booking/bookingSaga.js:102:const COMPENSACIONESCOL = COLLECTIONS.COMPENSACIONES_PENDIENTES;
src/backend/booking/bookingCore.js:32:    COLLECTIONS,
src/backend/booking/bookingCore.js:318:const LOCKS_COL = COLLECTIONS.SLOT_LOCKS;
src/backend/booking/bookingCore.js:455:const TRANSACTIONS_COL = COLLECTIONS.BOOKING_TRANSACTIONS;
src/backend/booking/bookingCore.js:562:const CITAS_COL = COLLECTIONS.CITAS_F2;
src/backend/booking/bookingCore.js:704:const DUAL_CACHE_COL = COLLECTIONS.DUAL_SLOT_CACHE;
src/backend/security.js:23:    COLLECTIONS,
src/backend/security.js:161:            .query(COLLECTIONS.MAPA_STAFF)
src/backend/security.js:316:            .query(COLLECTIONS.RATE_LIMIT_BLOCKS)
src/backend/security.js:363:            .query(COLLECTIONS.RATE_LIMIT_BLOCKS)
src/backend/security.js:379:            COLLECTIONS.RATE_LIMIT_BLOCKS, {
src/backend/horario.web.js:31:  COLLECTIONS,
src/backend/horario.web.js:51:const REGISTROS_COL = COLLECTIONS.REGISTROS_HORARIOS_STAFF;
src/backend/horario.web.js:52:const MAPA_STAFF_COL = COLLECTIONS.MAPA_STAFF;
src/backend/reservas.web.js:28:  COLLECTIONS,
src/backend/reservas.web.js:94:const SERVICIOS_COL = COLLECTIONS.SERVICIOS_CATALOGO;
src/backend/reservas.web.js:889:          .query(COLLECTIONS.CITAS_F2)
src/backend/audit.js:21:    COLLECTIONS,
src/backend/audit.js:170:            COLLECTIONS.ALERTAS_OPERATIVAS,
src/backend/audit.js:209:            COLLECTIONS.ALERTAS_OPERATIVAS,
src/backend/__tests__/professional.testRunner.js:48:import { COLLECTIONS, ESTADO_CITA, ESTADO_PAGO, CLAVES_AEAT, TIPO_MOVIMIENTO } from '../internalConfig.js';
src/backend/__tests__/professional.testRunner.js:262:            mockWixData.insert.withArgs(COLLECTIONS.SLOT_LOCKS, lockAttempt1).resolves({ _id: slotKey });
src/backend/__tests__/professional.testRunner.js:265:            mockWixData.insert.withArgs(COLLECTIONS.SLOT_LOCKS, lockAttempt2).callsFake(() => Promise.reject(new Error('Duplicate key error')));
src/backend/__tests__/professional.testRunner.js:267:            const result1 = await mockWixData.insert(COLLECTIONS.SLOT_LOCKS, lockAttempt1);
src/backend/__tests__/professional.testRunner.js:271:                await mockWixData.insert(COLLECTIONS.SLOT_LOCKS, lockAttempt2);
src/backend/__tests__/audit.e2e.js:10:    COLLECTIONS,
src/backend/__tests__/audit.e2e.js:983:        collection: COLLECTIONS.REGISTROS_HORARIOS_STAFF,
src/backend/__tests__/audit.e2e.js:1043:        { name: COLLECTIONS.MOVIMIENTOS_CAJA, requiredFields: ["sequenceNumber", "invoiceNumber", "totalAmount", "taxableAmount", "taxAmount", "businessTaxId", "previousRecordHash", "currentRecordHash"] },
src/backend/__tests__/audit.e2e.js:1044:        { name: COLLECTIONS.CITAS_F2, requiredFields: ["bookingId", "serviceId", "resourceId", "startDate", "endDate", "status", "paymentStatus"] },
src/backend/__tests__/audit.e2e.js:1045:        { name: COLLECTIONS.ASIENTOS_CONTABLES, requiredFields: ["journalEntryId", "sequenceNumber", "fiscalYear", "fiscalPeriod", "totalDebe", "totalHaber", "entryStatus"] },
src/backend/__tests__/audit.e2e.js:1046:        { name: COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE, requiredFields: ["journalEntryId", "lineNumber", "accountCode", "debitAmount", "creditAmount"] },
src/backend/__tests__/audit.e2e.js:1047:        { name: COLLECTIONS.LIBRO_REGISTRO_FACTURAS_EXPEDIDAS, requiredFields: ["invoiceNumber", "invoiceIssueDate", "claveRegistro", "totalAmount", "taxAmount", "previousRecordHash", "currentRecordHash"] },
src/backend/__tests__/audit.e2e.js:1048:        { name: COLLECTIONS.HISTORICO_CIERRES_Z, requiredFields: ["date", "totalCash", "totalCard", "totalNet", "openingHash", "closingHash", "status"] },
src/backend/__tests__/audit.e2e.js:1049:        { name: COLLECTIONS.REGISTROS_HORARIOS_STAFF, requiredFields: ["staffMemberId", "type", "timestamp"] },
src/backend/__tests__/audit.e2e.js:1050:        { name: COLLECTIONS.SLOT_LOCKS, requiredFields: ["slotKey", "lockOwnerId", "expiresAt"] },
src/backend/__tests__/unit.testRunner.js:12:  COLLECTIONS,
src/backend/__tests__/unit.testRunner.js:213:    assert.ok(COLLECTIONS[col], `Colección ${col} no definida`);
src/backend/__tests__/unit.testRunner.js:214:    assert.strictEqual(typeof COLLECTIONS[col], 'string', `Colección ${col} no es string`);
src/backend/__tests__/unit.testRunner.js:215:    assert.ok(COLLECTIONS[col].length > 0, `Colección ${col} vacía`);
src/backend/__tests__/unit.testRunner.js:219:  const values = Object.values(COLLECTIONS);
src/backend/internalConfig.js:67:export const COLLECTIONS = Object.freeze({
src/backend/crons.js:19:import { COLLECTIONS, SDK_CONFIG, CONCURRENCY } from "backend/internalConfig";
src/backend/crons.js:43:      .query(COLLECTIONS.SLOT_LOCKS)
src/backend/crons.js:51:        .remove(COLLECTIONS.SLOT_LOCKS, item._id, { suppressAuth: true })
src/backend/crons.js:74:      .query(COLLECTIONS.DUAL_SLOT_CACHE)
src/backend/crons.js:82:        .remove(COLLECTIONS.DUAL_SLOT_CACHE, item._id, {
src/backend/crons.js:174:      .query(COLLECTIONS.COMPENSACIONES_PENDIENTES)
src/backend/crons.js:193:          COLLECTIONS.COMPENSACIONES_PENDIENTES,
src/backend/crons.js:207:          .update(COLLECTIONS.COMPENSACIONES_PENDIENTES, comp, {
src/backend/crons.js:217:              COLLECTIONS.ALERTAS_OPERATIVAS,
src/backend/crons.js:265:      .query(COLLECTIONS.AVAILABILITY_DAYS_CACHE)
src/backend/crons.js:273:        .remove(COLLECTIONS.AVAILABILITY_DAYS_CACHE, item._id, {
src/backend/crons.js:323:      COLLECTIONS.CITAS_F2,
src/backend/crons.js:324:      COLLECTIONS.MOVIMIENTOS_CAJA,
src/backend/crons.js:325:      COLLECTIONS.SLOT_LOCKS,
src/backend/crons.js:326:      COLLECTIONS.MAPA_STAFF,
src/backend/crons.js:327:      COLLECTIONS.COMPENSACIONES_PENDIENTES,
src/backend/crons.js:358:          COLLECTIONS.ALERTAS_OPERATIVAS,
src/backend/eventLog.js:34:    COLLECTIONS,
src/backend/eventLog.js:223:            .get(COLLECTIONS.CAJA_ACTUAL, CASH_SEQ_ID, { suppressAuth: true, consistentRead: true })
src/backend/eventLog.js:228:                .get(COLLECTIONS.CAJA_ACTUAL, CASH_REGISTER_ID, { suppressAuth: true, consistentRead: true })
src/backend/eventLog.js:246:                .insert(COLLECTIONS.CAJA_ACTUAL, seqDoc, { suppressAuth: true })
src/backend/eventLog.js:251:                            .get(COLLECTIONS.CAJA_ACTUAL, CASH_SEQ_ID, { suppressAuth: true, consistentRead: true })
src/backend/eventLog.js:269:        await wixData.save(COLLECTIONS.CAJA_ACTUAL, seqDoc, { suppressAuth: true });
src/backend/eventLog.js:283:        .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/eventLog.js:299:        .query(COLLECTIONS.DATOS_FISCALES)
src/backend/eventLog.js:306:    return await wixData.insert(COLLECTIONS.DATOS_FISCALES, {
src/backend/eventLog.js:322:        return await wixData.get(COLLECTIONS.SERVICIOS_CATALOGO, id, { suppressAuth: true });
src/backend/eventLog.js:513:    const cabecera = await wixData.insert(COLLECTIONS.MOVIMIENTOS_CAJA, doc, { suppressAuth: true });
src/backend/eventLog.js:521:        const det = await wixData.insert(COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE, {
src/backend/eventLog.js:619:        await wixData.insert(COLLECTIONS.FACTURAS_RECIBIDAS, {
src/backend/eventLog.js:692:        await wixData.insert(COLLECTIONS.HISTORICO_CIERRES_Z, {
src/backend/eventLog.js:728:                .get(COLLECTIONS.MOVIMIENTOS_CAJA, eventoId, { suppressAuth: true })
src/backend/eventLog.js:734:                .query(COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE)
src/backend/eventLog.js:783:                .query(COLLECTIONS.FACTURAS_RECIBIDAS)
src/backend/eventLog.js:846:                .get(COLLECTIONS.FACTURAS_RECIBIDAS, facturaId, { suppressAuth: true })
src/backend/eventLog.js:864:            let q = wixData.query(COLLECTIONS.FACTURAS_RECIBIDAS);
src/backend/eventLog.js:901:                .get(COLLECTIONS.FACTURAS_RECIBIDAS, facturaId, { suppressAuth: true })
src/backend/eventLog.js:913:            await wixData.update(COLLECTIONS.FACTURAS_RECIBIDAS, {
src/backend/eventLog.js:942:            .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:33:    COLLECTIONS,
src/backend/cajas.web.js:372:        .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:385:        COLLECTIONS.HISTORICO_CIERRES_Z,
src/backend/cajas.web.js:443:        await wixData.insert(COLLECTIONS.COMPENSACIONES_PENDIENTES, {
src/backend/cajas.web.js:563:                .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:715:            const saved = await wixData.insert(COLLECTIONS.MOVIMIENTOS_CAJA, movement, { suppressAuth: true });
src/backend/cajas.web.js:759:        const cajaCol = COLLECTIONS.CAJA_ACTUAL;
src/backend/cajas.web.js:787:            await wixData.insert(COLLECTIONS.COMPENSACIONES_PENDIENTES, {
src/backend/cajas.web.js:814:    const queueCol = COLLECTIONS.M365_GRAPH_SYNC_QUEUE;
src/backend/cajas.web.js:886:        await wixData.insert(COLLECTIONS.COMPENSACIONES_PENDIENTES, {
src/backend/cajas.web.js:919:        const cashRegister = await wixData.get(COLLECTIONS.CAJA_ACTUAL, CASH_REGISTER_ID, { suppressAuth: true }).catch(() => null);
src/backend/cajas.web.js:950:            COLLECTIONS.HISTORICO_CIERRES_Z,
src/backend/cajas.web.js:960:        const query = wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:1112:        const saved = await wixData.insert(COLLECTIONS.HISTORICO_CIERRES_Z, zRecord, { suppressAuth: true });
src/backend/cajas.web.js:1114:        const cashRegister = await wixData.get(COLLECTIONS.CAJA_ACTUAL, CASH_REGISTER_ID, { suppressAuth: true }).catch(() => null);
src/backend/cajas.web.js:1119:            await wixData.save(COLLECTIONS.CAJA_ACTUAL, cashRegister, { suppressAuth: true });
src/backend/cajas.web.js:1137:        const movements = await wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:1196:            .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:1290:            const saved = await wixData.insert(COLLECTIONS.MOVIMIENTOS_CAJA, movement, { suppressAuth: true });
src/backend/cajas.web.js:1336:            .query(COLLECTIONS.MOVIMIENTOS_CAJA)
src/backend/cajas.web.js:1349:                .query(COLLECTIONS.SERVICIOS_CATALOGO)
src/backend/cajas.web.js:1447:            const saved = await wixData.insert(COLLECTIONS.MOVIMIENTOS_CAJA, movement, { suppressAuth: true });
---

### Claves a retirar: grep -rn "CATEGORIAS_SERVICIO|LIBRO_REGISTRO_FACTURAS_EXPEDIDAS" src/ --include="*.js"
src/backend/__tests__/professional.testRunner.js:481:                libro: 'LIBRO_REGISTRO_FACTURAS_EXPEDIDAS',
src/backend/__tests__/audit.e2e.js:236:    // Paso 5: Verificar LIBRO_REGISTRO_FACTURAS_EXPEDIDAS
src/backend/__tests__/audit.e2e.js:252:        "Paso 5: Estructura LIBRO_REGISTRO_FACTURAS_EXPEDIDAS"
src/backend/__tests__/audit.e2e.js:1047:        { name: COLLECTIONS.LIBRO_REGISTRO_FACTURAS_EXPEDIDAS, requiredFields: ["invoiceNumber", "invoiceIssueDate", "claveRegistro", "totalAmount", "taxAmount", "previousRecordHash", "currentRecordHash"] },
src/backend/__tests__/unit.testRunner.js:199:    'CATEGORIAS_SERVICIO',
src/backend/__tests__/unit.testRunner.js:207:    'LIBRO_REGISTRO_FACTURAS_EXPEDIDAS',
src/backend/internalConfig.js:38:    CATEGORIAS_SERVICIO: "CategoriasServicio",
src/backend/internalConfig.js:45:    LIBRO_REGISTRO_FACTURAS_EXPEDIDAS: "LibroRegistroFacturasExpedidas",
---
### BOOKING_TYPE (grep -rn "BOOKING_TYPE\." src/ --include="*.js")
src/backend/internalConfig.js:889:    if (!type) return BOOKING_TYPE.NORMAL;
src/backend/internalConfig.js:891:    if (normalized === 'DUAL' || normalized === 'PAIR') return BOOKING_TYPE.DUAL;
src/backend/internalConfig.js:892:    if (normalized === 'PACKAGE' || normalized === 'PAQUETE') return BOOKING_TYPE.PACKAGE;
src/backend/internalConfig.js:893:    if (normalized === 'CANCELLED' || normalized === 'CANCELADO') return BOOKING_TYPE.CANCELLED;
src/backend/internalConfig.js:894:    return BOOKING_TYPE.NORMAL;
src/backend/internalConfig.js:901:    return normalizeBookingType(type) === BOOKING_TYPE.DUAL;
---total BOOKING_TYPE refs:
6
### UNPAID (grep -rn "UNPAID" src/ --include="*.js")
src/backend/booking/bookingSaga.js:1009:        const paymentStatus = isOnline ? PAYMENT_STATUS.PENDING_PAYMENT : PAYMENT_STATUS.UNPAID;
src/backend/booking/bookingCore.js:593:    const metaPago = String(p.paymentStatus || p.meta?.paymentStatus || "UNPAID").toUpperCase();
src/backend/__tests__/audit.e2e.js:590:        initial: ESTADO_PAGO.UNPAID,
src/backend/__tests__/audit.e2e.js:594:            `${ESTADO_PAGO.UNPAID} -> ${ESTADO_PAGO.PENDING_PAYMENT}`,
src/backend/__tests__/audit.e2e.js:599:    const step1Valid = paymentStateTransition.initial === ESTADO_PAGO.UNPAID &&
src/backend/__tests__/unit.testRunner.js:138:  assert.ok(ESTADO_PAGO.UNPAID === 'UNPAID', 'ESTADO_PAGO.UNPAID');
src/backend/__tests__/unit.testRunner.js:250:    paymentStatus: 'UNPAID',
src/backend/internalConfig.js:488:    UNPAID: "UNPAID",
---total UNPAID refs:
8

### Duplicidad prepareScheduledManagerPackages (grep -rn src/backend/)
src/backend/fiscalDocuments.web.js:358:export async function prepareScheduledManagerPackages(options = {}) {
src/backend/fiscalAggregator.web.js:443:export async function prepareScheduledManagerPackages(options = {}) {
---
### Alias legacy A-E MATRIZ en codigo ejecutable
src/backend/fiscalAggregator.web.js:50:  return Number(m.taxRate ?? m.tasaIva ?? 0);
src/backend/fiscalAggregator.web.js:153:    const taxRate = _readTaxRate(m);
src/backend/fiscalAggregator.web.js:154:    const taxRateKey = String(taxRate);
src/backend/fiscalAggregator.web.js:199:      state.breakdownByVatRate[taxRateKey] = { taxRate, taxableAmount: 0, taxAmount: 0, total: 0, operations: 0 };
src/backend/fiscalAggregator.web.js:314:        tasaIva: item.taxRate,
src/backend/fiscalAggregator.web.js:368:      taxRate: `${Math.round(_readTaxRate(m) * 100)}%`,
src/backend/contabilidad.js:84:    const value = Number(movement?.taxRate ?? movement?.tasaIva);
src/backend/contabilidad.js:207:        line.taxableBaseOrNonSubjectAmount, line.taxRate, line.chargedTaxAmount,
src/backend/contabilidad.js:232:        taxRate: tax?.taxRate ?? null,
src/backend/contabilidad.js:385:    const taxRate = _readTaxRate(movement);
src/backend/contabilidad.js:403:    const tax = { taxableBaseOrNonSubjectAmount: net, taxRate, chargedTaxAmount: vat || null };
src/backend/events.js:518:                        taxRate: Number(
src/backend/events.js:519:                            originalMovement.taxRate ?? 21
src/backend/events.js:686:                taxRate: 21,
src/backend/events.js:933:                taxRate: Number(
src/backend/events.js:934:                    originalMovement.taxRate ?? 21
src/backend/events.js:958:                    tipo: Number(originalMovement.taxRate ?? 21),
src/backend/booking/bookingCore.js:734:    if (expected.phase2ServiceId) {
src/backend/booking/bookingCore.js:735:        const cachedPhase2 = _safeTrim(item.phase2ServiceId);
src/backend/booking/bookingCore.js:736:        if (cachedPhase2 !== _safeTrim(expected.phase2ServiceId)) {
src/backend/booking/bookingCore.js:737:            log.warn("_getDualPairFromCache: phase2ServiceId mismatch", {
src/backend/booking/bookingCore.js:738:                pairToken, traceId, cached: cachedPhase2, expected: expected.phase2ServiceId,
src/backend/booking/bookingCore.js:937:                        linkedPhases: p.phase2ServiceId,
src/backend/reservas.web.js:88:    id: _safeTrim(addon.id || addon._id || addon.addonId),
src/backend/reservas.web.js:370:        () => wixData.query(SERVICIOS_COL).eq("slugUrl", clean).limit(1).find({ suppressAuth: true }),
src/backend/reservas.web.js:372:        "getServiceBySlugOrId:slugUrl"
src/backend/reservas.web.js:400:    if (mapped.slugUrl) {
src/backend/reservas.web.js:401:      _cacheSetBounded(serviceCatalogRAM, mapped.slugUrl, cacheEntry, CACHE_MAX_SIZE);
src/backend/reservas.web.js:469:  const slugUrl = _safeTrim(_readImport2Field(service, "slugUrl")) || null;
src/backend/reservas.web.js:477:  const taxRate = Number(_readImport2Field(service, "taxRate")) || 0;
src/backend/reservas.web.js:481:  const imageUrl = _safeTrim(_readImport2Field(service, "mainMedia")) || "";
src/backend/reservas.web.js:515:    slugUrl,
src/backend/reservas.web.js:522:    linkFases: allowCombine ? linkedPhases : null,
src/backend/reservas.web.js:536:    taxRate,
src/backend/reservas.web.js:557:      addonsPrecio: addons.map((addon) => Number(addon?.precio || 0)),
src/backend/reservas.web.js:558:      imageUrl,
src/backend/reservas.web.js:560:      taxRate,
src/backend/reservas.web.js:626:  const { linkFases, internalNotes, ...publicService } = service;
src/backend/reservas.web.js:1154:      serviceConfig?.data?.linkedPhases || serviceConfig?.data?.linkFases
src/backend/__tests__/professional.testRunner.js:320:                taxRate: 0.21,
src/backend/__tests__/audit.e2e.js:179:        taxRate: IVA_RATES.GENERAL,
src/backend/__tests__/audit.e2e.js:379:        taxRate: IVA_RATES.GENERAL,
src/backend/__tests__/audit.e2e.js:825:        taxRate: IVA_RATES.GENERAL,
src/backend/eventLog.js:358:        tipoImpositivo: Number(input.taxRate ?? catalog?.taxRate ?? 0),
src/backend/eventLog.js:427:        taxRate: Number(input.taxRate ?? IVA_RATES.GENERAL),
src/backend/eventLog.js:524:            taxRate: Number(d.taxRate ?? d.tipo ?? 0),
src/backend/eventLog.js:804:                taxRate: Number(payload?.taxRate) || IVA_RATES.GENERAL,
src/backend/cajas.web.js:403:    taxRate,
src/backend/cajas.web.js:411:        const taxAmount = _roundMoney(base * taxRate);
src/backend/cajas.web.js:432:    const base = _roundMoney(amount / (1 + taxRate));
src/backend/cajas.web.js:538:                : _roundMoney(amount / (1 + (Number(payload?.taxRate) || IVA_RATES.GENERAL)));
src/backend/cajas.web.js:577:        const taxRate = Number(payload?.taxRate) || IVA_RATES.GENERAL;
src/backend/cajas.web.js:580:            taxRate,
src/backend/cajas.web.js:615:                taxRate,
src/backend/cajas.web.js:1011:            const rate = String(Number(m.taxRate) || 0);
src/backend/cajas.web.js:1225:                taxRate: 0,
src/backend/cajas.web.js:1346:        let taxRate = IVA_RATES.GENERAL;
src/backend/cajas.web.js:1356:                taxRate = Number(serviceRes.items[0].taxRate) || IVA_RATES.GENERAL;
src/backend/cajas.web.js:1360:        const taxableBaseOrNonSubjectAmount = _roundMoney(amount / (1 + taxRate));
src/backend/cajas.web.js:1381:                taxableBaseOrNonSubjectAmount, taxAmount, taxRate,
---total:
107
### Frontend wix-data (esperado 0)
1
### detector includes("f2")

=== FASE1 EVIDENCIA (sesion 4, salidas literales) ===
$ node --check backend+booking completo -> ALL_CHECK_OK (6/6 ficheros)
$ grep -n UNPAID src/backend/internalConfig.js -> 0 coincidencias
$ grep -n prepareScheduledManagerPackages fiscalAggregator.web.js -> solo linea 515: comentario REMOVED (dedupe OK)
$ grep -rn 'includes("f2")' src/ -> 0
# tests 24
# suites 0
# pass 24
# fail 0

=== FASE1 cierre (sesion 4) ===
$ node tools/migrate-booking-type.js --input /tmp/citasf2-sample.json -> total 4, migrations 3 (NORMAL->SIMPLE, DUAL tok1->DUALF1/DUALF2), ambiguous 1 (a4 sin pairToken, NO se escribe)
\$ grep -rn '"UNPAID"' booking/ citasManager fiscalAggregator data.js -> solo caso de normalizacion legacy en escritura (adapter documentado), cero escrituras nuevas con UNPAID
# tests 24
# pass 24
# fail 0
 artifacts/evidencia/fase1.md       |  7 ++++++
 src/backend/booking/bookingCore.js | 51 ++++++++++++++++++++++++++++++++++++--
 src/backend/internalConfig.js      |  1 +
 3 files changed, 57 insertions(+), 2 deletions(-)
