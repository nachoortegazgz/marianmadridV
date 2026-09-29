/**
 * ============================================================================
 * FILE: backend/__tests__/register-wix-mocks.mjs
 * RESPONSIBILITY: Registra loader.mjs (hooks resolve/load) en el thread
 *   principal Y en cada worker de node:test via globalThis.__WIX_MOCK_LOADER__.
 *   Permite: node --import ./src/backend/__tests__/register-wix-mocks.mjs --test ...
 * STANDARDS: G10 ASCII Strict. Node >= 20.6.
 * ============================================================================
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const LOADER_URL = new URL('./loader.mjs', import.meta.url).href;

// Hilo principal (p.ej. dynamic import dentro de un test).
register(LOADER_URL, import.meta.resolve);

// Workers de node --test: heredan la marca y se auto-registran aqui.
globalThis.__WIX_MOCK_LOADER__ ??= LOADER_URL;
if (!globalThis.__WIX_MOCK_LOADER_REGISTERED__) {
  globalThis.__WIX_MOCK_LOADER_REGISTERED__ = true;
}
