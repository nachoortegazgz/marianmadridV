/*
MODULE: tools/wixLoader.mjs
VERSION: v5010.5-DYNAMIC-E2E
RESPONSIBILITY: Loader ESM de tests (Node >=20 --experimental-loader).
  Intercepts bare specifiers Wix SDK/Velo ("wix-data", "@wix/bookings", ...)
  and Velo alias paths ("backend/...", "public/..."), serving hermetic mocks
  or resolving to the real src/ files. Zero network, zero Velo runtime.
STANDARDS: ASCII only. Test tooling only; never deployed.
*/

const state = {
  locks: new Map(),
  transactions: new Map(),
  citas: [],
  staffSchedules: new Map()
};
globalThis.__TEST_STATE__ = state;

function makeWixDataMock() {
  function parseQuery(rows) {
    const filters = [];
    const q = {
      eq(field, value) { filters.push((r) => String(r[field]) === String(value)); return q; },
      ne(field, value) { filters.push((r) => String(r[field]) !== String(value)); return q; },
      gt(field, value) { filters.push((r) => r[field] != null && new Date(r[field]).getTime() > new Date(value).getTime()); return q; },
      in(field, arr) { filters.push((r) => (arr || []).map(String).includes(String(r[field]))); return q; },
      limit() { return q; },
      skip() { return q; },
      orderBy() { return q; },
      async find() {
        const out = [];
        for (const r of rows) {
          let keep = true;
          for (const f of filters) {
            try { if (!f(r)) { keep = false; break; } }
            catch (_e) { keep = false; break; }
          }
          if (keep) out.push(r);
        }
        return { items: out };
      },
      async count() { return (await this.find()).items.length; }
    };
    return q;
  }
  return {
    __esModule: true,
    default: {
      async get(collection, id) {
        if (collection === 'SlotLocks') return state.locks.get('SlotLocks|' + id) || null;
        if (collection === 'BookingTransactions') return state.transactions.get('BookingTransactions|' + id) || null;
        return null;
      },
      async insert(collection, item) {
        const doc = { ...item };
        const key = collection + '|' + (doc._id || '');
        if ((collection === 'SlotLocks' || collection === 'BookingTransactions') &&
            (collection === 'SlotLocks' ? state.locks.has(key) : state.transactions.has(key))) {
          throw new Error('WDE0123: Duplicated item');
        }
        if (collection === 'SlotLocks') state.locks.set(key, doc);
        else if (collection === 'BookingTransactions') state.transactions.set(key, doc);
        else if (collection === 'CitasF2') state.citas.push(doc);
        return doc;
      },
      async update(collection, item) {
        const key = collection + '|' + (item._id || '');
        if (collection === 'SlotLocks') state.locks.set(key, item);
        else if (collection === 'BookingTransactions') state.transactions.set(key, item);
        else if (collection === 'CitasF2') {
          const idx = state.citas.findIndex((c) => c.bookingId === item.bookingId);
          if (idx >= 0) state.citas[idx] = item; else state.citas.push(item);
        }
        return item;
      },
      async remove(collection, id) { state.locks.delete(collection + '|' + id); return true; },
      query(collection) {
        if (collection === 'SlotLocks') return parseQuery(Array.from(state.locks.values()));
        if (collection === 'BookingTransactions') return parseQuery(Array.from(state.transactions.values()));
        return parseQuery(collection === 'CitasF2' ? state.citas : []);
      },
    }
  };
}

const MOCKS = {
  'wix-data': () => makeWixDataMock(),
  '@wix/bookings': () => ({
    bookings: {
      createBooking: async () => ({ id: 'mock-booking' }),
      cancelBooking: async () => ({}),
      rescheduleBooking: async () => ({}),
      confirmOrDeclineBooking: async (_id, options) => ({ echoedOptions: options })
    },
    availabilityTimeSlots: { listAvailabilityTimeSlots: async () => ({ timeSlots: [] }) }
  }),
  '@wix/ecom': () => ({ checkout: { createCheckout: async () => ({}), getCheckoutUrl: async () => ({}) } }),
  'wix-auth': () => ({ elevate: (fn) => fn }),
  'wix-web-module': () => ({ webMethod: (_p, fn) => fn, Permissions: { Anyone: 'Anyone', MEMBER: 'Member', Admin: 'Admin' } }),
  'backend/staff': () => ({
    getStaffScheduleId: async (resourceId) => state.staffSchedules.get(resourceId) || null,
    getStaffDisplayName: async () => 'Mock Staff',
    getAllActiveResourceIds: async () => [],
    isActiveStaff: async () => true,
    findStaffByResourceId: async () => null,
    clearStaffCache: async () => {},
    getAllStaff: async () => [],
    findStaff: async () => null,
    getStaffResourceIdByEmail: async () => null
  }),
  '@wix/secrets': () => ({ secrets: { get: async () => ({ value: 'mock_secret_value_for_tests' }) } }),
  'wix-secrets-backend': () => ({ getSecret: async () => ({ value: 'mock_secret_value_for_tests' }) })
};

function mockUrl(name) { return 'mock:' + name.replace(/[^a-zA-Z0-9@/_-]/g, '_'); }
const NAME_BY_URL = new Map(Object.keys(MOCKS).map((k) => [mockUrl(k), k]));

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, specifier)) {
    return { url: mockUrl(specifier), format: 'module', shortCircuit: true };
  }
  if (specifier.startsWith('backend/') || specifier.startsWith('public/')) {
    const base = new URL('../src/', import.meta.url).href;
    const abs = base + specifier + (specifier.endsWith('.js') ? '' : '.js');
    return { url: abs, format: 'module', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('mock:')) {
    const name = NAME_BY_URL.get(url);
    const keys = Object.keys(MOCKS[name]());
    const lines = [
      // Same file URL => same module instance/realm as the bootstrap, so the
      // registration below is visible to test files that run afterwards.
      // Loader hooks and bootstrap share one process (see run_dynamic_e2e.sh),
      // so import.meta.url resolves to this exact file at runtime. The URL is
      // injected as a fully-formed string literal: no concatenation inside the
      // generated source (that was the invalid static-import syntax bug).
      'import { installMockGlobals } from ' + JSON.stringify(import.meta.url) + ';',
      'installMockGlobals();',
      'const m = globalThis.__MOCK_LOADER_REGISTRY__(' + JSON.stringify(name) + ');'
    ];
    for (const k of keys) {
      if (k === '__esModule') continue;
      lines.push(k === 'default' ? 'export default m.default;' : 'export const ' + k + ' = m[' + JSON.stringify(k) + '];');
    }
    return { format: 'module', source: lines.join('\n'), shortCircuit: true };
  }
  return nextLoad(url, context);
}

// Exported so the in-process bootstrap can install it on globalThis BEFORE
// any test file runs (custom loaders execute in an isolated context realm).
export function installMockGlobals() {
  globalThis.__MOCK_LOADER_REGISTRY__ = (name) => MOCKS[name]();
  globalThis.__TEST_STATE__ = state;
}
