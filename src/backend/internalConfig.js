/*
 * MODULE: backend/internalConfig.js
 * VERSION: v5010.10-CMS-VERIFIED-CORRECTED
 * Correcciones críticas aplicadas:
 * - Se conservan los nombres públicos originales de las constantes.
 * - Se corrigen referencias BOOKING_STATUS.
 * - Se conservan los enums nativos Wix con guion bajo.
 * - Se corrige el identificador de Alba.
 * - Se corrige la plantilla de buildInvoiceNumber.
 */

export const STAFF = Object.freeze({
  IDS: Object.freeze([
    "e556070a-6d6a-402e-8422-11133033ea76",
    "07f7344f-e7e4-4c53-854b-47fd82ac8d40",
    "9b905bfd-1a09-485d-9273-a24a20dfe648",
  ]),
  RESOURCE_TO_DISPLAY: Object.freeze({
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
  HISTORICO_CIERRES_Z: "HistoricoCierresZ",
  LIBRO_ASIENTOS_CONTABLES_DETALLE: "LibroAsientosContablesDetalle",
  INVENTARIO_STOCK_VENTA: "InventarioStockVenta",
});

export const OPERATIONAL_COLLECTIONS = Object.freeze({
  AVAILABILITY_DAYS_CACHE: "AvailabilityDaysCache",
  DUAL_SLOT_CACHE: "DualSlotCache",
  MAPA_STAFF: "MapaStaff",
  MOVIMIENTOS_CAJA: "MovimientosCaja",
  MOVIMIENTOS_INVENTARIO: "MovimientosInventario",
  PROCESSED_WEBHOOK_EVENTS: "ProcessedWebhookEvents",
  PROVEEDORES_LISTA: "ProveedoresLista",
  RATE_LIMIT_BLOCKS: "RateLimitBlocks",
  REGISTROS_HORARIOS_STAFF: "RegistrosHorariosStaff",
  SERVICIOS_CATALOGO: "ServiciosCatalogo",
  SLOT_LOCKS: "SlotLocks",
});

export const FORBIDDEN_COLLECTIONS = Object.freeze([
  "AsientosContables",
  "EventosSistemaFacturacion",
  "FacturasRecibidas",
  "ConfiguracionFiscal",
  "LibroRegistroFacturasRecibidas",
  "PlanCuentasContables",
  "CategoriasServicio",
  "LibroRegistroFacturasExpedidas",
]);

export const RECORD_TYPE = Object.freeze({
  TERCERO: "TERCERO",
  CONFIG_SISTEMA: "CONFIG_SISTEMA",
});
export const RECORDTYPECONFIGSISTEMA = RECORD_TYPE.CONFIG_SISTEMA;

export const COLLECTIONS = Object.freeze({
  ...BUSINESS_COLLECTIONS,
  ...OPERATIONAL_COLLECTIONS,
});

export const API = Object.freeze({
  STAFF_RESOURCE_TYPE_ID: "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155",
  MARIAN_MANAGEMENT_RESOURCE_ID: "e556070a-6d6a-402e-8422-11133033ea76",
});

export const SDK_CONFIG = Object.freeze({
  TZ: "Europe/Madrid",
  LOCATION_ID: "7a12abfd-bf30-4847-bcdf-00dc573d4802",
  LOCATION_TYPES: Object.freeze({
    TIME_SLOTS: "BUSINESS",
    BOOKINGS_WRITER: "OWNER_BUSINESS",
  }),
  M365: Object.freeze({ ENABLED: false }),
  ACCOUNTING: Object.freeze({ ENABLED: false }),
  SYNC_BOOKINGS_SERVICES_ENABLED: false,
});

export const BOOKING_STATUS = Object.freeze({
  CREATED: "CREATED",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  DECLINED: "DECLINED",
  WAITING_LIST: "WAITING_LIST",
  UPDATED: "UPDATED",
  CANCELED: "CANCELED",
  REFUNDED: "REFUNDED",
});

export const INACTIVE_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.CANCELED,
  BOOKING_STATUS.DECLINED,
  "REJECTED",
  "NOSHOW",
]);

export const PAYMENT_STATUS = Object.freeze({
  UNDEFINED: "UNDEFINED",
  NOT_PAID: "NOT_PAID",
  UNPAID: "NOT_PAID",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PENDING_LEDGER: "PENDING_LEDGER",
  PAID: "PAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  EXEMPT: "EXEMPT",
});

export function buildInvoiceNumber(year, month, sequenceNumber) {
  const seq = String(sequenceNumber).padStart(4, "0");
  return `${year}${month}-${seq}`;
}

/*
 * Nota: este archivo contiene el bloque corregido de las constantes afectadas.
 * Los bloques no incluidos deben conservarse desde la versión original,
 * aplicando únicamente la misma regla: no renombrar claves públicas ni enums.
 */
