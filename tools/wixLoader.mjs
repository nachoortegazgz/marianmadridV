// ============================================================================
// tools/wixLoader.mjs -- ESM module hooks for the DYN harness (Velo parity)
// ----------------------------------------------------------------------------
// Runs in the HOOKS WORKER THREAD (Node >= 20). It is a PURE ROUTING TABLE:
// no state lives here. Fake module SOURCES are received via register(data)
// and returned through load(); they self-initialize in the APP realm when
// evaluated (globalThis.__WIX_FAKE__ on the main thread). This design makes
// the historical "double makeState() instance" failure structurally
// impossible -- see artifacts/loader-double-instance-repro.md.
// ============================================================================

function registry() {
  return globalThis.__registryData__ || { fakes: {}, realFileUrls: {} };
}

export async function resolve(specifier, context, nextResolve) {
  const r = registry();
  if (Object.prototype.hasOwnProperty.call(r.fakes, specifier)) {
    if (r.fakes[specifier] === null) {
      // Route-only entry: bare Velo specifier -> REAL file under src/.
      const mapped = r.realFileUrls[specifier];
      if (mapped) return { url: mapped, shortCircuit: true };
    } else {
      return { url: 'wix-fake:' + specifier, shortCircuit: true };
    }
  }
  // Generic Velo-style resolution for any other bare backend/* or public/*.
  if ((specifier.startsWith('backend/') || specifier.startsWith('public/')) &&
      !specifier.startsWith('.') && !context.parentURL?.startsWith('file:') === false) {
    const mapped = r.realFileUrls[specifier];
    if (mapped) return { url: mapped, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('wix-fake:')) {
    const r = registry();
    const key = url.slice('wix-fake:'.length);
    const src = r.fakes[key];
    if (typeof src !== 'string') {
      throw new Error('[wixLoader] missing fake source for ' + key);
    }
    return { format: 'module', source: src, shortCircuit: true };
  }
  return nextLoad(url, context);
}

export function initialize(data) {
  globalThis.__registryData__ = data || { fakes: {}, realFileUrls: {} };
}
