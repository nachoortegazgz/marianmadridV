/*
 * ============================================================================
 * FILE: backend/booking/core/config.js
 * VERSION: v5010.7 (FASE 3 - extraccion CORE-09/CORE-10)
 * RESPONSIBILITY: Constantes de dominio derivadas de internalConfig (FIX-32,
 *   CORE-04): STAFF_RESOURCE_TYPE_ID y CONFIGURED_LOCATION_ID normalizada.
 *   Extraccion 1:1; bookingCore.js queda como FACHADA que reexporta.
 * CONSUMERS: backend/booking/core/validation.js y bookingCore.js (fachada).
 * DEPENDENCIAS: solo backend/internalConfig + public/mmUtils => sin ciclos.
 * STANDARDS: G10 ASCII strict.
 * ============================================================================
 */

import { API, SDK_CONFIG } from "backend/internalConfig";
import { _safeTrim } from "public/mmUtils";

// FIX-32: STAFF_RESOURCE_TYPE_ID via SSOT.
export const STAFF_RESOURCE_TYPE_ID = API.STAFF_RESOURCE_TYPE_ID;

// CORE-07: Ubicacion configurada, normalizada una sola vez.
export const CONFIGURED_LOCATION_ID = _safeTrim(SDK_CONFIG?.LOCATION_ID);
