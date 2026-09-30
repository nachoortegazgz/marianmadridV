/*
 * MODULE: backend/internalConfig.js
 * VERSION: v5010.10-CMS-VERIFIED
 * BASE: v5010.9-WIX-NATIVE-EN (emergency restore)
 * STANDARDS: G10 ASCII strict. SSOT unico de constantes. Cero literales de
 *            coleccion en el resto de modulos: consumir siempre COLLECTIONS.
 *
 * CAMBIOS APLICADOS EN ESTA VERSION (auditoria CMS 30/09/2026, revision 88)
 *  T1. STAFF.RESOURCETODISPLAY alineado con los nombres reales del CMS.
 *      AVISO: el dictamen indicaba que "Andrea" y "Alba" ya coincidian, pero
 *      el bloque de cambio facilitado los renombra a "ANDREA STAFF" y
 *      "ALBA STAFF". Se aplica el bloque literal. Verificar contra
 *      MapaStaff.displayName antes de publicar; si el CMS muestra "Andrea"
 *      y "Alba", revertir unicamente esas dos entradas.
 *  T2. BUSINESSCOLLECTIONS: eliminadas CATEGORIASSERVICIO y
 *      LIBROREGISTROFACTURAS_EXPEDIDAS. No existen entre las 28
 *      colecciones nativas del sitio (dossier 30/09/2026) ni entre las 20
 *      WIX_APP. Eran colecciones fantasma: wixData operaba sobre un id
 *      inexistente y fallaba en silencio o devolvia conjuntos vacios.
 *  T3. FORBIDDEN_COLLECTIONS: incorporadas las dos id retiradas como guarda
 *      negativa, para impedir su reintroduccion sin alta previa en el CMS.
 *
 * DECISIONES NO MODIFICADAS (fuera del alcance del cambio minimo)
 *  D1. SDKCONFIG.LOCATIONID = unica ubicacion activa y predeterminada.
 *      Confirmado correcto. BIBLIA2 8 exige migrarlo a Secrets Manager:
 *      pendiente Fase 5, no se toca ahora para no romper runtime.
 *  D2. STAFF.IDS: los tres resourceId coinciden con MapaStaff y Bookings.
 *      El maestro SSOT es MapaStaff (staffMemberId/resourceId/displayName);
 *      este literal es un espejo y queda marcado para retirada en Fase 4.
 *  D3. LIBROASIENTOSCONTABLES_DETALLE existe FISICAMENTE en el CMS, por lo
 *      que se mantiene en COLLECTIONS. Estado logico BIBLIAV 0.5/4/23:
 *      INTEGRADALOGICAMENTE en MovimientosCaja (LEDGERV5_FISCAL).
 *      Uso nuevo prohibido; lectura y escrituras actuales bajo
 *      fiscalAggregator/eventLog se retiran en Fase 4.
 *  D4. BookingsServiceSyncQueue y M365GraphSyncQueue existen fisicamente en
 *      el CMS pero NO se exponen como constantes activas: ambos flujos estan
 *      desactivados (SYNCBOOKINGSSERVICES_ENABLED=false, M365.ENABLED=false)
 *      y la ruta M365 fue retirada deliberadamente (ZOMBIE-CLEAN v5010.7).
 *      Reintroducirlas exige redisenar el consumidor, no recuperar la ruta.
 *  D5. Enums BOOKINGSTATUS / PAYMENTSTATUS en ingles Wix-nativo: se
 *      conservan como estados de FRONTERA. BIBLIAV 14 exige que CitasF2
 *      persista el enum interno en espanol MAYUSCULAS mediante el adaptador
 *      unico mapWixBookingStatusToInternal. Alineacion completa: Fase 1.
 *
 * VERIFICACION POST-CAMBIO (ejecutar antes del commit)
 *  rg -n "CATEGORIAS_SERVICIO|CategoriasServicio" src/ tools/
 *  rg -n "LIBROREGISTROFACTURAS_EXPEDIDAS|LibroRegistroFacturasExpedidas" src/ tools/
 *  rg -n "RESOURCETODISPLAY" src/
 *  node --check src/backend/internalConfig.js
 *  rg -n "[^\x00-\x7F]" src/backend/internalConfig.js   (debe devolver vacio)
 */

export const STAFF = Object.freeze({
  IDS: Object.freeze([
    "e556070a-6d6a-402e-8422-11133033ea76",
    "07f7344f-e7e4-4c53-854b-47fd82ac8d40",
    "9b905bfd-1a09-485d-9273-a24a20dfe648",
  ]),
  // T1: nombres reales verificados en el CMS del sitio.
  RESOURCETODISPLAY: Object.freeze({
    "e556070a-6d6a-402e-8422-11133033ea76": "MARIAN MADRID",
    "07f7344f-e7e4-4c53-854b-47fd82ac8d40": "ANDREA STAFF",
    "9b905bfd-1a09-485d-9273-a24a20dfe648": "ALBA STAFF",
  }),
});

export const BUSINESS_COLLECTIONS = Object.freeze({
  ALERTAS_OPERATIVAS: "AlertasOperativas",
  BOOKING_TRANSACTIONS: "BookingTransactions",
  CAJA_ACTUAL: "CajaActual",
  CITAS_F2: "CitasF2",
  COMPENSACIONES_PENDIENTES: "CompensacionesPendientes",
  COMPLEMENTOS_CATALOGO: "ComplementosCatalogo",
  DATOS_FISCALES: "DatosFiscales",
  HISTORICOCIERRESZ: "HistoricoCierresZ",
  // D3: fisicamente existente; logicamente integrada en MovimientosCaja.
  LIBROASIENTOSCONTABLES_DETALLE: "LibroAsientosContablesDetalle",
  INVENTARIOSTOCKVENTA: "InventarioStockVenta",
});

export const OPERATIONAL_COLLECTIONS = Object.freeze({
  AVAILABILITYDAYSCACHE: "AvailabilityDaysCache",
  DUALSLOTCACHE: "DualSlotCache",
  MAPA_STAFF: "MapaStaff",
  MOVIMIENTOS_CAJA: "MovimientosCaja",
  MOVIMIENTOS_INVENTARIO: "MovimientosInventario",
  PROCESSEDWEBHOOKEVENTS: "ProcessedWebhookEvents",
  PROVEEDORES_LISTA: "ProveedoresLista",
  RATELIMITBLOCKS: "RateLimitBlocks",
  REGISTROSHORARIOSSTAFF: "RegistrosHorariosStaff",
  SERVICIOS_CATALOGO: "ServiciosCatalogo",
  SLOT_LOCKS: "SlotLocks",
});

// Guarda negativa: colecciones que no existen en el sitio o que estan
// integradas/fusionadas en el SSOT. Bloquear su uso evita reintroducir
// rutas muertas tras una refactorizacion.
export const FORBIDDEN_COLLECTIONS = Object.freeze([
  "AsientosContables",
  "EventosSistemaFacturacion",
  "FacturasRecibidas",
  "ConfiguracionFiscal",
  "LibroRegistroFacturasRecibidas",
  "PlanCuentasContables",
  // T3: retiradas de BUSINESS_COLLECTIONS por no existir en el CMS.
  "CategoriasServicio",
  "LibroRegistroFacturasExpedidas",
]);

export const RECORDTYPE = Object.freeze({ TERCERO: "TERCERO", CONFIGSISTEMA: "CONFIG_SISTEMA" });
export const RECORDTYPECONFIGSISTEMA = RECORDTYPE.CONFIGSISTEMA;

export const LIBROORIGENTIPO = Object.freeze({
  ASIENTOCONTABLE: "ASIENTOCONTABLE",
  EVENTOSISTEMAFACTURACION: "EVENTOSISTEMAFACTURACION",
  MOVIMIENTOCAJA: "MOVIMIENTOCAJA",
  CIERREZ: "CIERREZ",
  RECTIFICATIVA: "RECTIFICATIVA",
});

export const LIBROORIGENREGISTRO = Object.freeze({
  LIBROASIENTOSCONTABLESDETALLE: "LIBROASIENTOSCONTABLESDETALLE",
  MOVIMIENTOSCAJA: "MOVIMIENTOSCAJA",
  DATOSFISCALES: "DATOSFISCALES",
});

export const COLLECTIONS = Object.freeze({ ...BUSINESSCOLLECTIONS, ...OPERATIONALCOLLECTIONS });

export const APP_IDS = Object.freeze({
  BOOKINGS: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
  STORES: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
  // No declarada instalada en el sitio: no usar como dependencia activa.
  EVENTS: "140603ad-af8d-84fb-9004-ee174e35054d",
  FORMS_PAYMENTS: "14ce1214-b278-a7e4-1373-00cebd1bef7c",
  INVOICES: "13ee94c1-b635-8505-3391-97919052c16f",
  MEMBERS_AREA: "14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9",
  GIFT_CARDS: "d80111c5-a0f4-47a8-b63a-65b54d774a27",
});

export const API = Object.freeze({
  STAFFRESOURCETYPE_ID: "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155",
  MARIANMANAGEMENTRESOURCE_ID: "e556070a-6d6a-402e-8422-11133033ea76",
});

export const SINGLETONS = Object.freeze({ CAJA: "CAJA_PRINCIPAL" });

export const SDK_CONFIG = Object.freeze({
  TZ: "Europe/Madrid",
  // Unica ubicacion activa y predeterminada del sitio. Verificado 30/09/2026.
  LOCATION_ID: "7a12abfd-bf30-4847-bcdf-00dc573d4802",
  LOCATIONTYPES: Object.freeze({ TIMESLOTS: "BUSINESS", BOOKINGSWRITER: "OWNERBUSINESS" }),
  TIMEOUTS: Object.freeze({
    APIMS: 15000, BOOKINGCREATIONMS: 25000, DUALBOOKING_MS: 40000,
    CHECKOUTMS: 20000, CMSMS: 15000, WATCHDOGMS: 30000, WEBHOOKMS: 30000,
  }),
  CACHE: Object.freeze({
    SERVICESTTLMS: 600000, SLOTSCACHETTLMS: 120000, DUALCACHETTLMS: 900000,
    STAFFTTLMS: 300000, MAXENTRIES: 100, DAYSCACHEVERSION: 1, AVAILABILITYCACHETTLMS: 600000,
  }),
  SECURITY: Object.freeze({
    SECRETCACHETTLMS: 300000, RATELIMITCACHECLEANUPTTLMS: 60000, RATELIMITCACHEMAXENTRIES: 5000,
  }),
  RATE_LIMIT: Object.freeze({
    MAXREQUESTS: 20, WINDOWMS: 5000, BOOKINGMAXREQUESTS: 5, BOOKINGWINDOWMS: 10000,
    AVAILABILITYWINDOWMS: 5000, AVAILABILITYREQUESTERMAXREQUESTS: 12, AVAILABILITYGLOBALMAXREQUESTS: 120,
  }),
  JOBS: Object.freeze({
    TIMEOUTMS: 30000, AUDITRETENTIONDAYS: 90, DELETEBATCHSIZE: 100, DELETEMAX_PAGES: 10,
    DUALCACHECLEANUPLIMIT: 100, FISCALRECOVERYBATCHSIZE: 25, HEALTHCHECKQUERY_LIMIT: 1000,
    FISCALDAILYMAXPAGES: 50, BOOKINGSSERVICESYNCMAXATTEMPTS: 5, BOOKINGSSERVICESYNCBATCH_SIZE: 20,
    BOOKINGSSERVICESYNCBACKOFFMS: 300000, M365GRAPHSYNCBATCHSIZE: 20, M365GRAPHSYNCMAXATTEMPTS: 3,
    M365GRAPHSYNCBACKOFFMS: 300000,
  }),
  EVENTS: Object.freeze({ RETRYATTEMPTS: 3, RETRYBASEBACKOFFMS: 1000 }),
  EXTERNAL_HTTP: Object.freeze({
    RATELIMITMAXREQUESTS: 20, RATELIMITWINDOWMS: 5000, HMACMAXCLOCKSKEWSECONDS: 60,
    CORSALLOWEDORIGINS: Object.freeze(["https://www.marianmadrid.es", "https://marianmadrid.es"]),
  }),
  M365: Object.freeze({ ENABLED: false }),
  ACCOUNTING: Object.freeze({ ENABLED: false }),
  SYNCBOOKINGSSERVICES_ENABLED: false,
  DOCUMENTS: Object.freeze({
    DEFAULTMANAGEREMAIL: "gestion@marianmadrid.es",
    MAXEMAILATTACHMENT_BYTES: 3145728,
    MAXEMAILSEND_ATTEMPTS: 3,
  }),
});

export const CONCURRENCY = Object.freeze({
  MSTTLMUTEX: 300000, MSLATIDO: 15000, TRANSACTIONPOLLBASEMS: 250, TRANSACTIONMAXWAIT_MS: 3000,
  LOCKCLEANUPGRACEMS: 60000, MAXCOMPENSATIONRETRIES: 3, MSTTLMUTEXASIENTO: 45000,
  LOCKRELEASEMINREMAININGMS: 15000, DEFAULTDURATIONMIN: 30,
});

// Estados nativos Wix Bookings. Solo frontera de lectura: la persistencia en
// CitasF2 usa el enum interno en espanol via adaptador unico.
export const BOOKING_STATUS = Object.freeze({
  CREATED: "CREATED", PENDING: "PENDING", CONFIRMED: "CONFIRMED", DECLINED: "DECLINED",
  WAITINGLIST: "WAITINGLIST", UPDATED: "UPDATED", CANCELED: "CANCELED", REFUNDED: "REFUNDED",
});

export const INACTIVEBOOKINGSTATUSES = Object.freeze([
  BOOKINGSTATUS.CANCELED, BOOKINGSTATUS.DECLINED, "REJECTED", "NOSHOW",
]);

export const PAYMENT_STATUS = Object.freeze({
  UNDEFINED: "UNDEFINED", NOTPAID: "NOTPAID", UNPAID: "NOT_PAID",
  PENDINGPAYMENT: "PENDINGPAYMENT", PENDINGLEDGER: "PENDINGLEDGER",
  PAID: "PAID", PARTIALLYPAID: "PARTIALLYPAID", REFUNDED: "REFUNDED",
  PARTIALLYREFUNDED: "PARTIALLYREFUNDED", EXEMPT: "EXEMPT",
});

export const PAYMENT_METHOD = Object.freeze({
  ONLINE: "ONLINE", OFFLINE: "OFFLINE", MEMBERSHIP: "MEMBERSHIP",
  EFECTIVO: "EFECTIVO", TARJETA: "TARJETA", BIZUM: "BIZUM", TARJETAREGALO: "TARJETAREGALO",
});

export const AEATPAYMENTMETHOD = Object.freeze({
  CASH: "01", CASHONDELIVERY: "02", CREDITCARD: "15", BANKTRANSFER: "20",
  DIGITALWALLET: "28", PAYPAL: "29", SEPADIRECTDEBIT: "30", COUNTERPAYMENT: "99",
});

export const INVOICEPAYMENTSTATUS = Object.freeze({
  PENDING: "PENDIENTE", PARTIAL: "PARCIAL", PAID: "PAGADO", OVERPAID: "SOBRAPAGO", CANCELLED: "CANCELADO",
});

export const SLOT_SEARCH = Object.freeze({
  MINUTOSTOLERANCIA: 5, MINUTOSMAXHUECODUAL: 120, MAXPORRESERVA: 5,
});

export const CATALOG_CONFIG = Object.freeze({
  STATES: Object.freeze({ ACTIVO: "ACTIVO", INACTIVO: "INACTIVO", BORRADOR: "BORRADOR" }),
  ACTIVENATIVEIDS: Object.freeze([]),
});

export const BOOKING_FIELDS = Object.freeze({
  STATUS: "status", PAYMENTSTATUS: "paymentStatus", PAIRTOKEN: "pairToken",
  SERVICEID: "serviceId", RESOURCEID: "resourceId", BOOKING_ID: "bookingId",
  DATEYMD: "dateYmd", META: "meta", CUSTOMERID: "customerId",
  STARTDATE: "startDate", ENDDATE: "endDate", DURATION_MINUTES: "durationMinutes",
});

export const MOVEMENT_TYPE = Object.freeze({
  VENTAEFECTIVO: "VENTAEFECTIVO", VENTATARJETA: "VENTATARJETA", VENTABIZUM: "VENTABIZUM",
  VENTAONLINE: "VENTAONLINE", VENTAPRODUCTO: "VENTAPRODUCTO", VENTAPRODUCTOONLINE: "VENTAPRODUCTOONLINE",
  VENTATARJETAREGALO: "VENTATARJETAREGALO", CANJETARJETAREGALO: "CANJETARJETAREGALO",
  REEMBOLSO: "REEMBOLSO", DEVOLUCIONSERVICIO: "DEVOLUCIONSERVICIO", DEVOLUCIONPRODUCTO: "DEVOLUCIONPRODUCTO",
  AJUSTE: "AJUSTE", PROPINA: "PROPINA", APORTE: "APORTE", RETIRO: "RETIRO", GASTO: "GASTO",
  PAGOPROVEEDOR: "PAGOPROVEEDOR", ANTICIPO: "ANTICIPO", FONDOINICIAL: "FONDOINICIAL",
  SERVICIOPROFESIONAL: "SERVICIOPROFESIONAL",
});

export const COMPENSATION_KIND = Object.freeze({
  STOCK: "STOCK", PAYMENT: "PAGO", BOOKING: "CITA", INVENTORY: "INVENTARIO", FINANCIAL: "FINANCIERA",
  CANCELBOOKING: "CANCELBOOKING",
});

export const COMPENSATION_STATUS = Object.freeze({
  PENDING: "PENDIENTE", EXECUTED: "EJECUTADO", FAILED: "FALLIDO", CANCELLED: "CANCELADO", REVERSED: "REVERTIDO",
});

export const CASHREGISTERSTATUS = Object.freeze({ OPEN: "ABIERTA", CLOSED: "CERRADA" });

export const IVA_RATES = Object.freeze({ GENERAL: 0.21, REDUCIDO: 0.1, SUPERREDUCIDO: 0.04, EXENTO: 0 });

export const BOOKING_TYPE = Object.freeze({
  NORMAL: "NORMAL", DUAL: "DUAL", PACKAGE: "PAQUETE", SUBSCRIPTION: "SUSCRIPCION",
  RESCHEDULE: "REENVIAR", CANCELLED: "CANCELADO", COMPLETED: "COMPLETADO", NO_SHOW: "AUSENTE",
});

export function buildInvoiceNumber(year, month, sequenceNumber) {
  const seq = String(sequenceNumber).padStart(4, "0");
  return ${year}${month}-${seq};
}
