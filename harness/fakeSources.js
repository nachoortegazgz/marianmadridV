/*
MODULE: harness/fakeSources.js
VERSION: v5010.7-FASE1
RESPONSIBILITY: Fuentes AUTOCONTENIDAS de los modulos fake que el harness
  inyecta via module.register(). Cada string se evalua en el REALM DE LA APP
  (hilo principal), por lo que su estado vive en globalThis.__WIX_FAKE__ del
  mismo realm donde el test lee globalThis.__TEST_STATE__. Cero sharing entre
  workers => cero doble instancia.
STANDARDS: G10 ASCII strict. Sin eval, sin imports dinamicos concatenados.
*/

// ---------------------------------------------------------------------------
// wix-data: store Map clave `${coll}|${id}` + query builder encadenable.
// ---------------------------------------------------------------------------
const WIX_DATA = `
const S = (globalThis.__WIX_FAKE__ = globalThis.__WIX_FAKE__ || {});
S.locks = S.locks || new Map();
S.transactions = S.transactions || new Map();
S.citas = S.citas || [];
S.staffSchedules = S.staffSchedules || new Map();
S.generic = S.generic || new Map();
S.calls = S.calls || [];

const clone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const dupErr = function () { const e = new Error("WDE0123: Duplicated item"); e.code = "WDS004"; return e; };

class Builder {
  constructor(store, coll) { this._store = store; this._coll = coll; this._preds = []; this._limit = Infinity; this._skip = 0; }
  eq(f, v) { this._preds.push(function (it) { return it[f] === v; }); return this; }
  ne(f, v) { this._preds.push(function (it) { return it[f] !== v; }); return this; }
  in(f, arr) { this._preds.push(function (it) { return Array.isArray(arr) && arr.indexOf(it[f]) >= 0; }); return this; }
  hasSome() { return this; }
  contains(f, v) { this._preds.push(function (it) { return String(it[f] || "").indexOf(v) >= 0; }); return this; }
  startsWith(f, v) { this._preds.push(function (it) { return String(it[f] || "").startsWith(v); }); return this; }
  orderBy(f, dir) { this._order = [f, dir]; return this; }
  limit(n) { this._limit = n; return this; }
  skip(n) { this._skip = n; return this; }
  _match() {
    var items = this._store.filter((it) => this._preds.every((p) => p(it)));
    if (this._order) {
      const f = this._order[0], sgn = this._order[1] === "desc" ? -1 : 1;
      items = items.slice().sort((a, b) => (a[f] < b[f] ? -sgn : a[f] > b[f] ? sgn : 0));
    }
    return items;
  }
  async find(opts) {
    S.calls.push({ op: "find", coll: this._coll, opts: opts || null });
    const all = this._match();
    const page = all.slice(this._skip, this._skip + this._limit);
    return { items: clone(page), total: all.length };
  }
  async count() { return this._match().length; }
}

const STORE_FOR = { SlotLocks: S.locks, BookingTransactions: S.transactions, CitasF2: S.citas };

function listFor(coll) {
  if (coll === "CitasF2") return S.citas;
  const m = coll === "SlotLocks" ? S.locks : coll === "BookingTransactions" ? S.transactions : S.generic.get(coll);
  if (m) return [...m.values()];
  return [];
}

const wixData = {
  query(coll) { return new Builder(listFor(coll), coll); },
  async get(coll, id, opts) {
    S.calls.push({ op: "get", coll, id, opts: opts || null });
    const m = STORE_FOR[coll] || S.generic.get(coll);
    if (!m) return null;
    const it = m.get(coll + "|" + id);
    return it ? clone(it) : null;
  },
  async insert(coll, item, opts) {
    S.calls.push({ op: "insert", coll, id: item && item._id, opts: opts || null });
    const id = item && item._id ? String(item._id) : "gen_" + (S.seq = (S.seq || 0) + 1) + "_" + Date.now();
    const key = coll + "|" + id;
    let m = STORE_FOR[coll];
    if (!m) { m = new Map(); S.generic.set(coll, m); }
    if (coll === "CitasF2") {
      const clash = S.citas.find((c) => c._id === id);
      if (clash) throw dupErr();
      const doc = clone(item); doc._id = id; S.citas.push(doc);
      return doc;
    }
    if (m.has(key)) throw dupErr();
    const doc = clone(item); doc._id = id; m.set(key, doc);
    return doc;
  },
  async update(coll, item, opts) {
    S.calls.push({ op: "update", coll, id: item && item._id, opts: opts || null });
    const id = String(item._id);
    const key = coll + "|" + id;
    if (coll === "CitasF2") {
      const idx = S.citas.findIndex((c) => c._id === id);
      if (idx < 0) throw new Error("NOT_FOUND on update " + coll + "/" + id);
      const merged = Object.assign({}, S.citas[idx], clone(item));
      S.citas[idx] = merged; return clone(merged);
    }
    const m = STORE_FOR[coll] || S.generic.get(coll);
    if (!m || !m.has(key)) throw new Error("NOT_FOUND on update " + coll + "/" + id);
    const merged = Object.assign({}, m.get(key), clone(item));
    m.set(key, merged); return clone(merged);
  },
  async remove(coll, id, opts) {
    S.calls.push({ op: "remove", coll, id, opts: opts || null });
    const m = STORE_FOR[coll] || S.generic.get(coll);
    if (m) m.delete(coll + "|" + id);
    if (coll === "CitasF2") { const i = S.citas.findIndex((c) => c._id === id); if (i >= 0) S.citas.splice(i, 1); }
    return { _id: String(id) };
  },
  async setQueryValue(k, v) { return { key: k, value: v }; },
};
export default wixData;
`;

// ---------------------------------------------------------------------------
// @wix/bookings: echo de opciones para DYN-08. elevate() es identidad aqui.
// ---------------------------------------------------------------------------
const BOOKINGS = `
const S = (globalThis.__WIX_FAKE__ = globalThis.__WIX_FAKE__ || {});
export const bookings = {
  async cancelBooking(bookingId, reason) {
    return { _id: String(bookingId), status: "CANCELLED", cancelledBy: "elevated", reason: reason || null };
  },
  async confirmOrDeclineBooking(bookingId, options) {
    return { _id: String(bookingId), echoedOptions: Object.assign({}, options || {}) };
  },
  async getBooking(bookingId) { return { _id: String(bookingId), status: "ACCEPTED" }; },
};
export const bookingSettings = { async getGeneralSettings() { return { platform: "OWN" }; } };
export default { bookings, bookingSettings };
`;

// ---------------------------------------------------------------------------
// @wix/ecom: echo de checkout para flujos ONLINE.
// ---------------------------------------------------------------------------
const ECOM = `
export const checkout = {
  async createCheckout(request) {
    return { checkout: { _id: "chk_mock_1", currency: "EUR", totalSum: request?.currencyTranDetails?.transactionSummary?.totalSum || null } };
  },
  async getCheckoutUrl(checkoutId, opts) { return { url: "https://mock.checkout/" + checkoutId }; },
};
export default { checkout };
`;

// ---------------------------------------------------------------------------
// wix-auth: elevate = identidad (paridad de contrato, no de permisos).
// ---------------------------------------------------------------------------
const AUTH = `
export function elevate(fn) { return fn; }
export const currentUser = { async login() { return {}; } };
export default { elevate, currentUser };
`;

// ---------------------------------------------------------------------------
// wix-web-module: webMethod = passthrough con metadatos.
// ---------------------------------------------------------------------------
const WEB_MODULE = `
export const webMethod = {
  ok(handler) { return handler; },
  error(handler) { return handler; },
};
export default { webMethod };
`;

// ---------------------------------------------------------------------------
// backend/staff: scheduleIds desde el store compartido del fake.
// ---------------------------------------------------------------------------
const STAFF = `
const S = (globalThis.__WIX_FAKE__ = globalThis.__WIX_FAKE__ || {});
S.staffSchedules = S.staffSchedules || new Map();
export async function getStaffScheduleId(resourceId) {
  const key = String(resourceId || "");
  return S.staffSchedules.get(key) || null;
}
export default { getStaffScheduleId };
`;

// ---------------------------------------------------------------------------
// backend/logger: captura silenciosa (el logger real usa APIs Velo).
// ---------------------------------------------------------------------------
const LOGGER = `
const S = (globalThis.__WIX_FAKE__ = globalThis.__WIX_FAKE__ || {});
S.logs = S.logs || [];
function rec(level, msg, meta) { S.logs.push({ level, msg: String(msg), meta: meta || null }); }
export const logger = {
  debug: (m, x) => rec("debug", m, x),
  info: (m, x) => rec("info", m, x),
  warn: (m, x) => rec("warn", m, x),
  error: (m, x) => rec("error", m, x),
};
export default { logger };
`;

export const FAKE_SOURCES = {
  'wix-data': WIX_DATA,
  '@wix/bookings': BOOKINGS,
  '@wix/ecom': ECOM,
  'wix-auth': AUTH,
  'wix-web-module': WEB_MODULE,
  'backend/staff': STAFF,
  'backend/logger': LOGGER,
};
