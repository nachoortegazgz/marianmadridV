/*
=============================================================================
MODULE: backend/internalConfig.js
VERSION: v5010-CLEAN
BASE: v5009.3 + Eliminacion Total Legacy + SSOT V20.1 Definitivo
RESPONSIBILITY: Single Source of Truth (SSOT) for backend configuration.
STANDARDS: G10 ASCII Strict, Zero Deprecated Aliases, Zero Legacy.
=============================================================================
*/

// =============================================================================
// BLOQUE 1 - STAFF ACTIVO (HARDCODED SEGURO)
// =============================================================================

export const STAFF = Object.freeze({
    IDS: Object.freeze([
        "e556070a-6d6a-402e-8422-11133033ea76", // Marian
        "07f7344f-e7e4-4c53-854b-47fd82ac8d40", // Andrea
        "9b905bfd-1a09-485d-9273-a24a20dfe648", // Alba
    ]),

    RESOURCE_TO_DISPLAY: Object.freeze({
        "e556070a-6d6a-402e-8422-11133033ea76": "Marian Madrid",
        "07f7344f-e7e4-4c53-854b-47fd82ac8d40": "Andrea",
        "9b905bfd-1a09-485d-9273-a24a20dfe648": "Alba",
    }),
});

// =============================================================================
// BLOQUE 2 - COLECCIONES CMS CANONICAS (SEPARADAS POR DOMINIO)
// CFG-10: Separacion estricta Business vs Operacional
// =============================================================================

// SSOT V2 (v5011): unicas fuentes de verdad fiscales/contables:
//   - DatosFiscales (config fiscal / Veri*factu; singleton recordType=CONFIG_SISTEMA)
//   - LibroAsientosContablesDetalle (asientos + eventos de facturacion / trazabilidad;
//     discriminacion por origenTipo / origenRegistro)
// MovimientosCaja queda como diario operativo de caja (no libro contable).
// ELIMINADAS definitivas (no reintroducir): ConfiguracionFiscal (fusionada en
// DatosFiscales via recordType), AsientosContables y EventosSistemaFacturacion
// (ambas sustituidas por LibroAsientosContablesDetalle), FacturasRecibidas,
// BookingsServiceSyncQueue, M365GraphSyncQueue.
export const BUSINESS_COLLECTIONS = Object.freeze({
    ALERTAS_OPERATIVAS: "AlertasOperativas",
    BOOKING_TRANSACTIONS: "BookingTransactions",
    CAJA_ACTUAL: "CajaActual",
    CATEGORIAS_SERVICIO: "CategoriasServicio",
    CITAS_F2: "CitasF2",
    COMPENSACIONES_PENDIENTES: "CompensacionesPendientes",
    COMPLEMENTOS_CATALOGO: "ComplementosCatalogo",
    DATOS_FISCALES: "DatosFiscales",
    HISTORICO_CIERRES_Z: "HistoricoCierresZ",
    // SSOT V2: libro de asientos contables (nombre EXACTO en singular; nunca
    // plural). Sustituye a AsientosContables y EventosSistemaFacturacion.
    LIBRO_ASIENTOS_CONTABLES_DETALLE: "LibroAsientosContablesDetalle",
    INVENTARIO_STOCK_VENTA: "InventarioStockVenta",
    LIBRO_REGISTRO_FACTURAS_EXPEDIDAS: "LibroRegistroFacturasExpedidas",
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
    // v5010.7 ZOMBIE-CLEAN: eliminadas PLAN_CUENTAS_CONTABLES y
    // LIBRO_REGISTRO_FACTURAS_RECIBIDAS (cero consumidores verificados por
    // grep; FacturasRecibidas/plan contable separados son arquitectura muerta
    // segun BIBLIA v5009-V20: MovimientosCaja LEDGER_V5_FISCAL es el SSOT).
});

// v5011 GUARD-SSOT: colecciones prohibidas. Ningun modulo de src/ debe
// leer, escribir, consultar ni referenciar estas IDs (ni como coleccion CMS
// ni como valor de origenRegistro). La guarda estatica tools/dead_code_guard.mjs
// falla (exit 1) ante cualquier referencia funcional.
// NOTA SSOT V2: LibroAsientosContablesDetalle ya NO esta prohibida: es la
// coleccion definitiva de asientos y eventos de facturacion/trazabilidad.
export const FORBIDDEN_COLLECTIONS = Object.freeze([
    "AsientosContables",
    "EventosSistemaFacturacion",
    "FacturasRecibidas",
    "ConfiguracionFiscal",
    "LibroRegistroFacturasRecibidas",
    "PlanCuentasContables",
]);

// v5010.7: tipos de registro canonicos de DatosFiscales (fusion BIBLIA R3:
// ConfiguracionFiscal se integra en DatosFiscales via recordType).
export const RECORD_TYPE = Object.freeze({
    TERCERO: "TERCERO",
    CONFIG_SISTEMA: "CONFIG_SISTEMA",
});

// Constante canonica del singleton de configuracion fiscal/Veri*factu.
export const RECORDTYPECONFIGSISTEMA = RECORD_TYPE.CONFIG_SISTEMA;

// SSOT V2: campos discriminadores obligatorios al escribir en
// LibroAsientosContablesDetalle (asientos + eventos de facturacion).
export const LIBRO_ORIGEN_TIPO = Object.freeze({
    ASIENTOCONTABLE: "ASIENTOCONTABLE",
    EVENTOSISTEMAFACTURACION: "EVENTOSISTEMAFACTURACION",
    MOVIMIENTOCAJA: "MOVIMIENTOCAJA",
    CIERREZ: "CIERREZ",
    RECTIFICATIVA: "RECTIFICATIVA",
});

export const LIBRO_ORIGEN_REGISTRO = Object.freeze({
    LIBROASIENTOSCONTABLESDETALLE: "LIBROASIENTOSCONTABLESDETALLE",
    MOVIMIENTOSCAJA: "MOVIMIENTOSCAJA",
    DATOSFISCALES: "DATOSFISCALES",
});

// Alias de solo lectura para compatibilidad interna estricta (no usar en nuevo codigo)
export const COLLECTIONS = Object.freeze({
    ...BUSINESS_COLLECTIONS,
    ...OPERATIONAL_COLLECTIONS
});

// =============================================================================
// BLOQUE 3 - WIX APP IDS & API KEYS
// =============================================================================

export const APP_IDS = Object.freeze({
    // BIBLIA R19 (linea 190): App ID canonica de Wix Bookings preservada.
    // No es un placeholder; verificado contra catalogId SSOT y CART-SHAPE.
    BOOKINGS: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
    STORES: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
    EVENTS: "140603ad-af8d-84fb-9004-ee174e35054d",
    FORMS_PAYMENTS: "14ce1214-b278-a7e4-1373-00cebd1bef7c",
    INVOICES: "13ee94c1-b635-8505-3391-97919052c16f",
    MEMBERS_AREA: "14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9",
    GIFT_CARDS: "d80111c5-a0f4-47a8-b63a-65b54d774a27",
});

export const API = Object.freeze({
    STAFF_RESOURCE_TYPE_ID: "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155",
    MARIAN_MANAGEMENT_RESOURCE_ID: "e556070a-6d6a-402e-8422-11133033ea76",
});

// =============================================================================
// BLOQUE 4 - SINGLETONS & SDK CONFIG
// =============================================================================

export const SINGLETONS = Object.freeze({
    CAJA: "CAJA_PRINCIPAL",
});

export const SDK_CONFIG = Object.freeze({
    TZ: "Europe/Madrid",
    LOCATION_ID: "7a12abfd-bf30-4847-bcdf-00dc573d4802",

    // B3-FIX: TIME_SLOTS debe ser "BUSINESS" per dev.wix.com V2 API
    LOCATION_TYPES: Object.freeze({
        TIME_SLOTS: "BUSINESS",
        // AUDIT-FIX v5010.3 (BIBLIA 2.2.1 fila 8): literal oficial del
        // enum Writer V2 de Wix Bookings, con guion bajo. Regla CERO ALIAS.
        BOOKINGS_WRITER: "OWNER_BUSINESS",
    }),

    TIMEOUTS: Object.freeze({
        API_MS: 15000,
        BOOKING_CREATION_MS: 25000,
        DUAL_BOOKING_MS: 40000,
        CHECKOUT_MS: 20000,
        CMS_MS: 15000,
        WATCHDOG_MS: 30000,
        WEBHOOK_MS: 30000,
    }),

    CACHE: Object.freeze({
        SERVICES_TTL_MS: 600000,
        SLOTS_CACHE_TTL_MS: 120000,
        DUAL_CACHE_TTL_MS: 900000,
        STAFF_TTL_MS: 300000,
        MAX_ENTRIES: 100,
        DAYS_CACHE_VERSION: 1,
        AVAILABILITY_CACHE_TTL_MS: 600000,
    }),

    SECURITY: Object.freeze({
        SECRET_CACHE_TTL_MS: 300000,
        RATE_LIMIT_CACHE_CLEANUP_TTL_MS: 60000,
        RATE_LIMIT_CACHE_MAX_ENTRIES: 5000,
    }),

    RATE_LIMIT: Object.freeze({
        MAX_REQUESTS: 20,
        WINDOW_MS: 5000,
        BOOKING_MAX_REQUESTS: 5,
        BOOKING_WINDOW_MS: 10000,
        AVAILABILITY_WINDOW_MS: 5000,
        AVAILABILITY_REQUESTER_MAX_REQUESTS: 12,
        AVAILABILITY_GLOBAL_MAX_REQUESTS: 120,
    }),

    JOBS: Object.freeze({
        TIMEOUT_MS: 30000,
        AUDIT_RETENTION_DAYS: 90,
        DELETE_BATCH_SIZE: 100,
        DELETE_MAX_PAGES: 10,
        DUAL_CACHE_CLEANUP_LIMIT: 100,
        FISCAL_RECOVERY_BATCH_SIZE: 25,
        HEALTH_CHECK_QUERY_LIMIT: 1000,
        FISCAL_DAILY_MAX_PAGES: 50,
        BOOKINGS_SERVICE_SYNC_MAX_ATTEMPTS: 5,
        BOOKINGS_SERVICE_SYNC_BATCH_SIZE: 20,
        BOOKINGS_SERVICE_SYNC_BACKOFF_MS: 300000,
        M365_GRAPH_SYNC_BATCH_SIZE: 20,
        M365_GRAPH_SYNC_MAX_ATTEMPTS: 3,
        M365_GRAPH_SYNC_BACKOFF_MS: 300000,
    }),

    EVENTS: Object.freeze({
        RETRY_ATTEMPTS: 3,
        RETRY_BASE_BACKOFF_MS: 1000,
    }),

    EXTERNAL_HTTP: Object.freeze({
        RATE_LIMIT_MAX_REQUESTS: 20,
        RATE_LIMIT_WINDOW_MS: 5000,
        HMAC_MAX_CLOCK_SKEW_SECONDS: 60,
        CORS_ALLOWED_ORIGINS: Object.freeze([
            "https://www.marianmadrid.es",
            "https://marianmadrid.es",
        ]),
    }),

    M365: Object.freeze({ ENABLED: false }),
    ACCOUNTING: Object.freeze({ ENABLED: false }),

    // Flag explicito para activar/desactivar sync de servicios (Deuda #6 resuelta)
    SYNC_BOOKINGS_SERVICES_ENABLED: false,

    DOCUMENTS: Object.freeze({
        DEFAULT_MANAGER_EMAIL: "gestion@marianmadrid.es",
        MAX_EMAIL_ATTACHMENT_BYTES: 3145728,
        MAX_EMAIL_SEND_ATTEMPTS: 3,
    }),
});

// =============================================================================
// BLOQUE 5 - CONCURRENCIA Y TRANSACCIONES
// =============================================================================

export const CONCURRENCY = Object.freeze({
    // v5010.4 (FASE 2): renombrado V20 segun BIBLIA 3.2 fila 11 y 3.2.1
    // filas 15-17. Cero nombres legacy: los consumidores usan ya el alias
    // espanol canonico.
    MS_TTL_MUTEX: 300000,          // REF: BIBLIA 3.2.1 f15 (ex MUTEX_TTL_MS)
    MS_LATIDO: 15000,              // REF: BIBLIA 3.2.1 f16 (ex HEARTBEAT_MS)
    // SIN EQUIVALENTE V20 DOCUMENTADO - MANTENER LEGACY
    // (grep BIBLIA/SSOT1: MS_SONDEO_TRANSACCION / MS_ESPERA_MAX_TRANSACCION
    // no existen en la norma; decision registrada en certificacion v5010.4)
    TRANSACTION_POLL_BASE_MS: 250,
    TRANSACTION_MAX_WAIT_MS: 3000,
    LOCK_CLEANUP_GRACE_MS: 60000,
    MAX_COMPENSATION_RETRIES: 3,
    MS_TTL_MUTEX_ASIENTO: 45000,   // REF: BIBLIA 3.2.1 f17 (ex LEDGER_MUTEX_TTL_MS)
    LOCK_RELEASE_MIN_REMAINING_MS: 15000,
    DEFAULT_DURATION_MIN: 30,
});

// =============================================================================
// BLOQUE 6 - ENUMS DE NEGOCIO (SSOT COMPLETO)
// Sin aliases, solo nombres canonicos en ingles/V20.1
// =============================================================================

export const REGIME_KEY = Object.freeze({
    GENERAL: "GENERAL",
    SIMPLIFIED: "SIMPLIFICADO",
    MODULES: "MODULOS",
    EQUIVALENCE: "EQUIVALENCIA",
    EXPORT: "EXPORTACION",
    INTRACOMMUNITY: "INTRACOMUNITARIO",
});

export const ENTRY_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    APPROVED: "APROBADO",
    REJECTED: "RECHAZADO",
    POSTED: "ASIENTADO",
    CANCELLED: "CANCELADO",
    DRAFT: "BORRADOR",
});

export const BALANCE_NATURE = Object.freeze({
    DEUDORA: "DEUDORA",
    ACREEDORA: "ACREEDORA",
    SALDO_0: "SALDO_0",
});

export const RECONCILIATION_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    MATCHED: "COINCIDE",
    DISCREPANCY: "DISCREPANCIA",
    EXCLUDED: "EXCLUIDO",
});

export const SIF_EVENT_TYPE = Object.freeze({
    SALE: "VENTA",
    PURCHASE: "COMPRA",
    EXPENSE: "GASTO",
    ADJUSTMENT: "AJUSTE",
    INVENTORY: "INVENTARIO",
    PAYMENT: "PAGO",
    INVOICE: "FACTURA",
    BOOKING: "CITA",
    CLOSURE: "CIERRE",
    TAX_REPORT: "DECLARACION",
});

export const JOURNEY_TYPE = Object.freeze({
    APPOINTMENT: "CITA",
    SALE: "VENTA",
    PURCHASE: "COMPRA",
    PAYMENT: "PAGO",
    INVOICE: "FACTURA",
    ADJUSTMENT: "AJUSTE",
    CLOSURE: "CIERRE",
    SYNC: "SINCRONIZACION",
});

export const ACCOUNT_NATURE = Object.freeze({
    DEUDORA: "DEUDORA",
    ACREEDORA: "ACREEDORA",
});

export const CLOSING_TYPE = Object.freeze({
    Z: "Z",
    X: "X",
    MENSUAL: "MENSUAL",
    ANUAL: "ANUAL",
});

export const PACKAGE_STATUS = Object.freeze({
    ACTIVE: "ACTIVO",
    INACTIVE: "INACTIVO",
    SUSPENDED: "SUSPENDIDO",
    EXPIRED: "VENCIDO",
    CANCELLED: "CANCELADO",
});

export const TAX_CODE = Object.freeze({
    IVA21S: "IVA21S",
    IVA21B: "IVA21B",
    IVA10S: "IVA10S",
    IVA10B: "IVA10B",
    IVA4S: "IVA4S",
    IVA4B: "IVA4B",
    IRPF15: "IRPF15",
    IRPF7: "IRPF7",
    IRPF19: "IRPF19",
    EXENTO: "EXENTO",
    NS: "NO_SUJETO",
});

export const COMPENSATION_KIND = Object.freeze({
    STOCK: "STOCK",
    PAYMENT: "PAGO",
    BOOKING: "CITA",
    INVENTORY: "INVENTARIO",
    FINANCIAL: "FINANCIERA",
});

export const COMPENSATION_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    EXECUTED: "EJECUTADO",
    FAILED: "FALLIDO",
    CANCELLED: "CANCELADO",
    REVERSED: "REVERTIDO",
});

export const QUEUE_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    PROCESSING: "PROCESANDO",
    COMPLETED: "COMPLETADO",
    FAILED: "FALLIDO",
    CANCELLED: "CANCELADO",
});

export const INVOICE_PAYMENT_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    PARTIAL: "PARCIAL",
    PAID: "PAGADO",
    OVERPAID: "SOBRAPAGO",
    CANCELLED: "CANCELADO",
});

export const AEAT_PAYMENT_METHOD = Object.freeze({
    CASH: "01",
    CASH_ON_DELIVERY: "02",
    CREDIT_CARD: "15",
    BANK_TRANSFER: "20",
    DIGITAL_WALLET: "28",
    PAYPAL: "29",
    SEPA_DIRECT_DEBIT: "30",
    COUNTER_PAYMENT: "99",
});

export const RECEPTION_SOURCE = Object.freeze({
    MANUAL: "MANUAL",
    IMPORT: "IMPORTACION",
    API: "API",
    SYNC: "SINCRONIZACION",
    AUTO: "AUTOMATICO",
});

export const VALIDATION_STATUS = Object.freeze({
    VALID: "VALIDO",
    INVALID: "INVALIDO",
    WARNING: "ADVERTENCIA",
    PENDING: "PENDIENTE",
});

export const BOOKING_TYPE = Object.freeze({
    NORMAL: "NORMAL",
    DUAL: "DUAL",
    PACKAGE: "PAQUETE",
    SUBSCRIPTION: "SUSCRIPCION",
    RESCHEDULE: "REENVIAR",
    CANCELLED: "CANCELADO",
    COMPLETED: "COMPLETADO",
    NO_SHOW: "AUSENTE",
});

export const CHANNEL_TYPE = Object.freeze({
    ONLINE: "ONLINE",
    INSTORE: "TIENDA",
    PHONE: "TELEFONO",
    MOBILE: "MOVIL",
    SOCIAL: "SOCIAL",
    PARTNER: "SOCIOPROVEEDOR",
});

export const RECORD_SOURCE = Object.freeze({
    SYSTEM: "SISTEMA",
    USER: "USUARIO",
    IMPORT: "IMPORTACION",
    API: "API",
    INTEGRATION: "INTEGRACION",
});

export const AEAT_SUBMISSION_STATUS = Object.freeze({
    PENDING: "PENDIENTE",
    SENT: "ENVIADO",
    ACCEPTED: "ACEPTADO",
    REJECTED: "RECHAZADO",
    PROCESSED: "PROCESADO",
    ERROR: "ERROR",
});

export const CLOSING_STATUS = Object.freeze({
    OPEN: "ABIERTO",
    CLOSED: "CERRADO",
    RECONCILED: "RECONCILIADO",
    LOCKED: "BLOQUEADO",
});

export const CLOCK_RECORD_TYPE = Object.freeze({
    CHECK_IN: "ENTRADA",
    CHECK_OUT: "SALIDA",
    BREAK_START: "PAUSA_INICIO",
    BREAK_END: "PAUSA_FIN",
    ADJUSTMENT: "AJUSTE",
});

export const CLOCK_REGISTERED_BY = Object.freeze({
    SELF: "AUTOMATICO",
    MANAGER: "GESTOR",
    SYSTEM: "SISTEMA",
});

export const AUDIT_LEVEL = Object.freeze({
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
    CRITICAL: "CRITICO",
});

// Enums Base (Timeclock, Movement, Payment, etc.)
export const TIMECLOCK_TYPE = Object.freeze({
    ENTRADA: "ENTRADA",
    SALIDA: "SALIDA",
    PAUSA_INICIO: "PAUSA_INICIO",
    PAUSA_FIN: "PAUSA_FIN",
    AJUSTE: "AJUSTE",
});

export const MOVEMENT_TYPE = Object.freeze({
    VENTA_EFECTIVO: "VENTA_EFECTIVO",
    VENTA_TARJETA: "VENTA_TARJETA",
    VENTA_BIZUM: "VENTA_BIZUM",
    VENTA_ONLINE: "VENTA_ONLINE",
    VENTA_PRODUCTO: "VENTA_PRODUCTO",
    VENTA_PRODUCTO_ONLINE: "VENTA_PRODUCTO_ONLINE",
    VENTA_TARJETA_REGALO: "VENTA_TARJETA_REGALO",
    CANJE_TARJETA_REGALO: "CANJE_TARJETA_REGALO",
    REEMBOLSO: "REEMBOLSO",
    DEVOLUCION_SERVICIO: "DEVOLUCION_SERVICIO",
    DEVOLUCION_PRODUCTO: "DEVOLUCION_PRODUCTO",
    AJUSTE: "AJUSTE",
    PROPINA: "PROPINA",
    APORTE: "APORTE",
    RETIRO: "RETIRO",
    GASTO: "GASTO",
    PAGO_PROVEEDOR: "PAGO_PROVEEDOR",
    ANTICIPO: "ANTICIPO",
    FONDO_INICIAL: "FONDO_INICIAL",
    SERVICIO_PROFESIONAL: "SERVICIO_PROFESIONAL",
});

export const PAYMENT_METHOD = Object.freeze({
    EFECTIVO: "EFECTIVO",
    TARJETA: "TARJETA",
    BIZUM: "BIZUM",
    ONLINE: "ONLINE",
    TARJETA_REGALO: "TARJETA_REGALO",
});

export const IVA_RATES = Object.freeze({
    GENERAL: 0.21,
    REDUCIDO: 0.1,
    SUPERREDUCIDO: 0.04,
    EXENTO: 0,
});

export const CASH_REGISTER_STATUS = Object.freeze({
    OPEN: "ABIERTA",
    CLOSED: "CERRADA",
});

export const BOOKING_STATUS = Object.freeze({
    CONFIRMED: "CONFIRMED",
    PENDING_PAYMENT: "PENDING_PAYMENT",
    CANCELLED: "CANCELLED",
    REFUNDED: "REFUNDED",
});

// Lista de estados inactivos para ranking de recursos (CORE-08)
export const INACTIVE_BOOKING_STATUSES = Object.freeze([
    "CANCELLED", "DECLINED", "REJECTED", "NOSHOW"
]);

export const PAYMENT_STATUS = Object.freeze({
    UNPAID: "UNPAID",
    NOT_PAID: "NOT_PAID",
    PENDING_PAYMENT: "PENDING_PAYMENT",
    PENDING_LEDGER: "PENDING_LEDGER",
    PAID: "PAID",
    // v5010.4 (FASE 0): valor valido segun SSOT1.txt seccion 4 y mapa CORE-06
    // de bookingCore.js (PARCIALMENTE_PAGADO -> PARTIALLY_PAID). Cero gap.
    PARTIALLY_PAID: "PARTIALLY_PAID",
    REFUNDED: "REFUNDED",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
});

export const COLLABORATOR_ROLES = Object.freeze({
    ADMIN: "ADMIN",
    GESTION: "GESTION",
    ESTILISTA: "ESTILISTA",
});

// =============================================================================
// BLOQUE 7 - CATALOGO Y ADDONS
// =============================================================================

export const CATALOG_CONFIG = Object.freeze({
    STATES: Object.freeze({
        ACTIVO: "ACTIVO",
        INACTIVO: "INACTIVO",
        BORRADOR: "BORRADOR",
    }),
    // FASE 3 (SDK V2): catalogId estatico oficial de Wix Bookings.
    // Referencia unica para estructurar lineas de carrito/checkout nativas
    // sin duplicar items (ver contract test CONTRACT-ECOM-CATALOG-ID).
    BOOKINGS_CATALOG_ID: "97f091c5-83e0-40d6-aa49-db3f3b9247f1",
    CURRENCY: "EUR",
    MAX_TITLE_LENGTH: 160,
    MAX_SUMMARY_LENGTH: 120,
    MAX_DESCRIPTION_LENGTH: 6000,
    MAX_DURATION_MINUTES: 1440,
});

export const SLOT_SEARCH = Object.freeze({
    DIAS_LIMITE: 14,
    // v5010.4 (FASE 2): renombrado V20 segun BIBLIA 3.2 fila 9 y 3.2.1
    // filas 12-13. Cero nombres legacy.
    MINUTOS_TOLERANCIA: 10,        // REF: BIBLIA 3.2.1 f12 (ex TOLERANCE_MINUTES)
    MINUTOS_MAX_HUECO_DUAL: 120,   // REF: BIBLIA 3.2.1 f13 (ex MAX_DUAL_GAP_MINUTES)
});

export const BOOKINGS_ADDON_CONFIG = Object.freeze({
    MAX_POR_RESERVA: 5,            // REF: BIBLIA 3.2.1 f14 (ex MAX_PER_BOOKING)
    ACTIVE_NATIVE_IDS: Object.freeze([]),
});

// =============================================================================
// BLOQUE 8 - JWT Y CAMPOS
// =============================================================================

export const JWT = Object.freeze({
    ALGORITHM: "HS256",
    MS_EXPIRACION: 1800000,        // REF: BIBLIA 3.2.1 f20 (ex EXPIRATION_MS)
});

export const BOOKING_FIELDS = Object.freeze({
    STATUS: "status",
    PAYMENT_STATUS: "paymentStatus",
    PAIR_TOKEN: "pairToken",
    SERVICE_ID: "serviceId",
    RESOURCE_ID: "resourceId",
    BOOKING_ID: "bookingId",
    DATE_YMD: "dateYmd",
    META: "meta",
    CUSTOMER_ID: "customerId",
    START_DATE: "startDate",
    END_DATE: "endDate",
    DURATION_MINUTES: "durationMinutes",
    PRICE: "price",
    CURRENCY: "currency",
    CREATED_DATE: "createdDate",
    UPDATED_DATE: "updatedDate",
    CANCELLED_DATE: "cancelledDate",
    REFUNDED_DATE: "refundedDate",
    PAYMENT_METHOD: "paymentMethod",
    NOTES: "notes",
    ADDONS: "addons",
    CUSTOM_FIELDS: "customFields",
});

export const STAFF_ACCESS = Object.freeze({
    ALLOWED_ROLES: Object.freeze(["ADMIN", "GESTION", "ESTILISTA"]),
    MARIAN_RESOURCE_ID: "e556070a-6d6a-402e-8422-11133033ea76",
});

export const CURRENCY_CONFIG = Object.freeze({
    MONEDA_VISUALIZACION: "EUR",   // REF: BIBLIA 3.2.1 f18 (ex DISPLAY_CURRENCY)
    DECIMALES: 2,                  // REF: BIBLIA 3.2.1 f19 (ex DECIMALS)
});

export const STAFF_DEFAULT_NAME = "Profesional";

// =============================================================================
// BLOQUE 9 - CUENTAS PGC Y FISCALES
// =============================================================================

export const ACCOUNTING_ACCOUNT = Object.freeze({
    CASH: "570000",
    BANKS: "572000",
    SERVICE_REVENUE: "705000",
    VAT_OUTPUT: "477000",
    VAT_INPUT: "472000",
    SALES_RETURNS: "708000",
    SUPPLIERS: "400000",
    PURCHASES_EXPENSES: "600000",
    SUSPENSE: "555000",
    TAX_IRPF_WITHHOLDING_PAYABLE: "475100",
    TAX_IRPF_WITHHOLDING_RECEIVABLE: "473000",
    TAX_EQUIVALENCE_SURCHARGE: "475800",
    CUSTOMER_ADVANCES: "438000",
    INVENTORY: "300000", // Anadido para v5010-CLEAN
});

// Nombres legibles para las cuentas (SSOT)
export const ACCOUNTING_ACCOUNT_NAME = Object.freeze({
    "570000": "Caja EUR",
    "572000": "Bancos",
    "705000": "Prestacion de Servicios",
    "477000": "HP IVA Repercutido",
    "472000": "HP IVA Soportado",
    "708000": "Devoluciones de Ventas",
    "400000": "Proveedores",
    "600000": "Compra de Mercaderias",
    "555000": "Cuenta Puente",
    "475100": "HP Retenciones a Practicar",
    "473000": "HP Retenciones Sufridas",
    "475800": "HP Recargo de Equivalencia",
    "438000": "Anticipos de Clientes",
    "300000": "Existencias de Mercaderias",
});

export const AEAT_INVOICE_TYPE = Object.freeze({
    F1: "F1",
    F2: "F2",
    F3: "F3",
    R1: "R1",
    R2: "R2",
    R3: "R3",
    R4: "R4",
    R5: "R5",
});

export const CORRECTION_REASON = Object.freeze({
    NUMERO_SERIE: "01",
    SERIE: "02",
    BASE_IMPONIBLE: "03",
    CUOTA: "04",
    FECHA: "05",
    IDENTIFICACION: "06",
    DESCUENTO: "07",
    DESTINATARIO: "08",
    OTRAS: "09",
});

export const IRPF_WITHHOLDING_RATE = Object.freeze({
    PROFESIONALES_GENERAL: 0.15,
    PROFESIONALES_PRIMEROS_3_ANOS: 0.07,
    MODULOS: 0.01,
    NINGUNA: 0,
});

export const VAT_ACCRUAL_STATUS = Object.freeze({
    DEVENGADO: "DEVENGADO",
    ANTICIPADO: "ANTICIPADO",
    APLICACION_ANTICIPO: "APLICACION_ANTICIPO",
});

export const FISCAL_ROLE = Object.freeze({
    EMISOR: "EMISOR",
    RECEPTOR: "RECEPTOR",
});

export const EU_VAT_PREFIXES = Object.freeze([
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
]);

export const EVENT_TYPE = Object.freeze({
    VENTA_LINEA: "VENTA_LINEA",
    COMPRA_LINEA: "COMPRA_LINEA",
    CIERRE_Z: "CIERRE_Z",
    AJUSTE: "AJUSTE",
    RECTIFICATIVA: "RECTIFICATIVA",
    MOV_STOCK: "MOV_STOCK",
});

export const ITEM_NATURE = Object.freeze({
    SERVICIO_PROPIO: "SERVICIO_PROPIO",
    PRODUCTO_VENTA: "PRODUCTO_VENTA",
    PRODUCTO_USO: "PRODUCTO_USO",
    GASTO_FIJO: "GASTO_FIJO",
});

export const THIRD_PARTY_TYPE = Object.freeze({
    CLIENTE: "CLIENTE",
    PROVEEDOR: "PROVEEDOR",
    STAFF: "STAFF",
    AAPP: "AAPP",
    MIXTO: "MIXTO",
});

export const PROJECTION_STATUS = Object.freeze({
    PENDIENTE: "PENDIENTE",
    OK: "OK",
    ERROR: "ERROR",
});

// =============================================================================
// BLOQUE 10 - SISTEMA INFORMATICO (VERI*FACTU)
// SSOT V2: los campos canonicos del singleton de DatosFiscales
// (recordType = CONFIG_SISTEMA, BIBLIA R3) son nomenclatura AEAT espanola
// en camelCase: nifProductor, nombreRazonProductor, idSistemaInformatico,
// numeroInstalacion, tipoUsoPosibleSoloVerifactu, tipoUsoPosibleMultiOT,
// indicadorMultiplesOT, fechaInicioVerifactu. El acceso al singleton es
// OBLIGATORIAMENTE filtrando por recordType = "CONFIG_SISTEMA".
// =============================================================================

export const COMPUTER_SYSTEM = Object.freeze({
    sistemaInformaticoNombre: "Marian Madrid Velo",
    idSistemaInformatico: "MM-VELO-001",
    version: "v5011",
    numeroInstalacion: "1",
    tipoUsoPosibleSoloVerifactu: "S",
    tipoUsoPosibleMultiOT: "N",
    indicadorMultiplesOT: "N",
    nifProductor: null, // Null seguro: se rellena desde DatosFiscales CONFIG_SISTEMA
    nombreRazonProductor: null,
});

/**
 * Construye el objeto COMPUTER_SYSTEM fusionando el fallback con la config real.
 * Lee exclusivamente la nomenclatura canonica V2 del singleton fiscal
 * (DatosFiscales recordType=CONFIG_SISTEMA). Lanza error si falta el NIF del
 * productor (nifProductor) en tiempo de ejecucion.
 */
export function buildComputerSystem(fiscalConfig) {
    const fallback = { ...COMPUTER_SYSTEM };

    if (!fiscalConfig || typeof fiscalConfig !== 'object') {
        // En entorno de prueba o fallo de carga, usamos fallback pero alertamos
        console.warn("FISCAL_CONFIG (DatosFiscales CONFIG_SISTEMA) no disponible, usando fallback COMPUTER_SYSTEM");
        return Object.freeze(fallback);
    }

    // Validacion estricta: Si hay config, debe tener NIF canonico
    const nifProductor = _safeTrimConfigValue(fiscalConfig.nifProductor);
    if (!nifProductor) {
        throw new Error("FISCAL_VIOLATION: nifProductor es obligatorio en el singleton fiscal (DatosFiscales recordType=CONFIG_SISTEMA) para operar en modo Veri*factu");
    }

    return Object.freeze({
        sistemaInformaticoNombre: fiscalConfig.sistemaInformaticoNombre || fallback.sistemaInformaticoNombre,
        idSistemaInformatico: fiscalConfig.idSistemaInformatico || fallback.idSistemaInformatico,
        version: fiscalConfig.version || fallback.version,
        numeroInstalacion: fiscalConfig.numeroInstalacion || fallback.numeroInstalacion,
        tipoUsoPosibleSoloVerifactu: fiscalConfig.tipoUsoPosibleSoloVerifactu || fallback.tipoUsoPosibleSoloVerifactu,
        tipoUsoPosibleMultiOT: fiscalConfig.tipoUsoPosibleMultiOT || fallback.tipoUsoPosibleMultiOT,
        indicadorMultiplesOT: fiscalConfig.indicadorMultiplesOT || fallback.indicadorMultiplesOT,
        nifProductor, // Obligatorio
        nombreRazonProductor: fiscalConfig.nombreRazonProductor || fallback.nombreRazonProductor,
        fechaInicioVerifactu: fiscalConfig.fechaInicioVerifactu || null,
    });
}

function _safeTrimConfigValue(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

// =============================================================================
// BLOQUE 11 - INTEGRIDAD Y LIMITES FISCALES (SSOT)
// =============================================================================

export const INTEGRITY = Object.freeze({
    SCHEMA_VERSION: "v5010.1",
    ALGORITHM_VERSION: "SHA256-v1",
    LEDGER_SCHEMA_VERSION: "ASIENTO_V4_FISCAL",
    GENESIS_HASH: "GENESIS_HASH_MM_2024",
    ENTRY_SCHEMA_VERSION: "ENTRY_V1",
    INTEGRITY_ALGORITHM_VERSION: "HMAC_SHA256_V1",
});

export const FISCAL_LIMITS = Object.freeze({
    CASHPAYMENT_MAX_EUR: 1000, // Ley 11/2021
    MONEY_EPSILON: 0.02,
    ACCOUNTING_EPSILON: 0.005,
    MAX_AMOUNT_PER_INVOICE: 100000,
    MAX_AMOUNT_PER_DAY: 500000,
    MAX_INVOICES_PER_DAY: 1000,
    MAX_ITEMS_PER_INVOICE: 100,
    MAX_QUANTITY_PER_ITEM: 99999,
    MIN_DATE: "2020-01-01",
    MAX_DATE: "2030-12-31",
});

// Conjunto de validacion centralizado (CFG-13)
export const VALIDATION_SETS = Object.freeze({
    MOVEMENT_TYPES: new Set(Object.values(MOVEMENT_TYPE)),
    PAYMENT_METHODS: new Set(Object.values(PAYMENT_METHOD)),
    THIRD_PARTY_TYPES: new Set(Object.values(THIRD_PARTY_TYPE)),
    EVENT_TYPES_REQUIRING_CATALOG: new Set(["VENTA_LINEA", "COMPRA_LINEA", "RECTIFICATIVA", "MOV_STOCK"]),
});

// Tipos de movimiento con signo negativo (PGC: cargos/abonos)
export const NEGATIVE_SIGN_MOVEMENT_TYPES = Object.freeze([
    MOVEMENT_TYPE.REEMBOLSO,
    MOVEMENT_TYPE.DEVOLUCION_SERVICIO,
    MOVEMENT_TYPE.DEVOLUCION_PRODUCTO,
    MOVEMENT_TYPE.GASTO,
    MOVEMENT_TYPE.PAGO_PROVEEDOR,
    MOVEMENT_TYPE.RETIRO,
]);

// =============================================================================
// BLOQUE 12 - HELPERS CRITICOS Y VALIDADORES
// =============================================================================

/**
 * (buildComputerSystem se define en el BLOQUE 10 junto a COMPUTER_SYSTEM.)
 */

export function resolveWithholdingAccount(fiscalRole) {
    switch (fiscalRole) {
        case FISCAL_ROLE.EMISOR:
            return ACCOUNTING_ACCOUNT.TAX_IRPF_WITHHOLDING_PAYABLE;
        case FISCAL_ROLE.RECEPTOR:
            return ACCOUNTING_ACCOUNT.TAX_IRPF_WITHHOLDING_RECEIVABLE;
        default:
            return null;
    }
}

/**
 * Valida la integridad del SSOT al arranque.
 */
export function validateInternalConfig() {
    const issues = [];

    // Verificar colecciones criticas
    if (!BUSINESS_COLLECTIONS.CITAS_F2 || !OPERATIONAL_COLLECTIONS.SLOT_LOCKS) {
        issues.push("Colecciones criticas faltantes");
    }

    // Verificar enums criticos
    if (Object.keys(BOOKING_FIELDS).length < 10) {
        issues.push("BOOKING_FIELDS incompleto");
    }

    // Verificar contrato Wix B3
    if (SDK_CONFIG.LOCATION_TYPES.TIME_SLOTS !== "BUSINESS") {
        issues.push(`VIOLACION_B3: TIME_SLOTS es ${SDK_CONFIG.LOCATION_TYPES.TIME_SLOTS}, debe ser BUSINESS`);
    }

    // Verificar limites fiscales
    if (FISCAL_LIMITS.CASHPAYMENT_MAX_EUR !== 1000) {
        issues.push("Limite efectivo incorrecto (debe ser 1000)");
    }

    return {
        valid: issues.length === 0,
        issues,
        timestamp: Date.now(),
    };
}

/**
 * Valida el contexto de ejecucion (usuario, location, timestamp).
 */
export function validateRuntimeContext(context) {
    const errors = [];
    
    if (!context) {
        errors.push("Contexto de ejecucion nulo");
        return { valid: false, errors };
    }
    
    if (!context.user || !context.user.role) {
        errors.push("Rol de usuario no definido");
    }
    
    if (!context.locationId) {
        errors.push("Location ID no definido");
    } else if (context.locationId !== SDK_CONFIG.LOCATION_ID) {
        errors.push(`Location ID invalido: ${context.locationId}`);
    }
    
    if (!context.timestamp || isNaN(new Date(context.timestamp).getTime())) {
        errors.push("Timestamp invalido");
    }
    
    return {
        valid: errors.length === 0,
        errors,
        timestamp: Date.now(),
    };
}

/**
 * Comparador seguro de enums (ignora mayusculas/minusculas y espacios).
 */
export function enumEq(value, expectedEnumValue) {
    if (!value || !expectedEnumValue) return false;
    return String(value).trim().toUpperCase() === String(expectedEnumValue).trim().toUpperCase();
}

/**
 * Verifica si un valor pertenece a un enum (ignora mayusculas/minusculas y espacios).
 */
export function enumIn(value, enumObject) {
    if (!value || !enumObject) return false;
    const stringValue = String(value).trim().toUpperCase();
    return Object.values(enumObject).some(v => String(v).trim().toUpperCase() === stringValue);
}

/**
 * Normaliza el tipo de reserva a valores canonicos.
 */
export function normalizeBookingType(type) {
    if (!type) return BOOKING_TYPE.NORMAL;
    const normalized = String(type).toUpperCase();
    if (normalized === 'DUAL' || normalized === 'PAIR') return BOOKING_TYPE.DUAL;
    if (normalized === 'PACKAGE' || normalized === 'PAQUETE') return BOOKING_TYPE.PACKAGE;
    if (normalized === 'CANCELLED' || normalized === 'CANCELADO') return BOOKING_TYPE.CANCELLED;
    return BOOKING_TYPE.NORMAL;
}

/**
 * Verifica si un tipo de reserva es DUAL.
 */
export function isDualBookingType(type) {
    return normalizeBookingType(type) === BOOKING_TYPE.DUAL;
}

/**
 * Valida formato GUID/UUID.
 */
export function isValidGuid(guid) {
    if (typeof guid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid);
}

/**
 * Genera numero de factura secuencial YYYYMM-SEQ.
 */
export function buildInvoiceNumber(date, sequenceNumber) {
    const d = new Date(date);
    const year = d.getFullYear().toString().slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const seq = String(sequenceNumber).padStart(4, '0');
    return `${year}${month}-${seq}`;
}
