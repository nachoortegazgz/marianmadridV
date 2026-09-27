/**
 * ============================================================================
 * FILE: backend/__tests__/loader.mjs
 * VERSION: v5011-SSOT-V2-QA
 * RESPONSIBILITY: Hooks resolve/load para ejecutar los modulos backend bajo
 *   Node puro: todo import "wix-*" / "@wix/*" (inexistente fuera de Velo) se
 *   resuelve a un modulo sintetico respaldado por wixMocks.js. Corrige el
 *   ERR_MODULE_NOT_FOUND: wix-data de los tests dinamicos.
 * USAGE: node --import ./src/backend/__tests__/register-wix-mocks.mjs \
 *          --test src/backend/__tests__/ssot.v5011.test.js
 * STANDARDS: G10 ASCII Strict. Node >= 20.6 (module.register).
 * ============================================================================
 */

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MOCKS_URL = pathToFileURL(join(HERE, 'wixMocks.js')).href;

// Raiz src/ del proyecto (para resolver el prefijo Velo "backend/...").
const SRC_DIR = join(HERE, '..', '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('wix-') || specifier.startsWith('@wix/')) {
    return { url: 'wix-mock:' + specifier, shortCircuit: true, format: 'module' };
  }
  // Notacion de modulos Velo: "backend/foo" -> src/backend/foo(.web).js
  if (specifier.startsWith('backend/') && !specifier.includes('node_modules')) {
    const base = join(SRC_DIR, specifier);
    for (const cand of [base + '.js', base + '.web.js', join(base, 'index.js')]) {
      if (existsSync(cand)) {
        return { url: pathToFileURL(cand).href, shortCircuit: true, format: 'module' };
      }
    }
  }
  // Notacion de modulos Velo: "public/foo" -> src/public/foo.js
  if (specifier.startsWith('public/') && !specifier.includes('node_modules')) {
    const base = join(SRC_DIR, specifier);
    for (const cand of [base + '.js', join(base, 'index.js')]) {
      if (existsSync(cand)) {
        return { url: pathToFileURL(cand).href, shortCircuit: true, format: 'module' };
      }
    }
  }
  return nextResolve(specifier, context);
}

function sourceFor(url) {
  const name = url.slice('wix-mock:'.length);
  if (name === 'wix-data') {
    return [
      `import { wixDataMock } from ${JSON.stringify(MOCKS_URL)};`,
      `export default wixDataMock;`,
      `export const items = wixDataMock;`,
    ].join('\n');
  }
  if (name.startsWith('wix-secrets')) {
    return [
      `import { wixSecretsMock } from ${JSON.stringify(MOCKS_URL)};`,
      `export const getSecret = wixSecretsMock.getSecret;`,
      `export const secrets = wixSecretsMock;`,
      `export default wixSecretsMock;`,
    ].join('\n');
  }
  if (name === 'wix-web-module') {
    return [
      `export const Permissions = {`,
      `  SiteMembers: 'Site Members', AdminsOnly: 'Admins Only',`,
      `  CurrentMember: 'Current Member', Public: 'Public', Members: 'Members',`,
      `};`,
      `export function webMethod(permissions, fn) { return fn; }`,
    ].join('\n');
  }
  // Resto de modulos wix-*: proxy encadenable seguro para cualquier uso.
  return [
    `const chainable = new Proxy(function () {}, {`,
    `  get: (t, k) => (k === Symbol.toPrimitive ? () => 'mock' : chainable),`,
    `  apply: () => chainable,`,
    `});`,
    `export default chainable;`,
    `export const availability = chainable;`,
    `export const bookings = chainable;`,
    `export const catalog = chainable;`,
    `export const orders = chainable;`,
    `export const payments = chainable;`,
    `export const members = chainable;`,
    `export const crm = chainable;`,
    `export const ecommerce = chainable;`,
    `export const locations = chainable;`,
    `export const getSecret = async () => undefined;`,
  ].join('\n');
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('wix-mock:')) {
    return { format: 'module', source: sourceFor(url), shortCircuit: true };
  }
  return nextLoad(url, context);
}
