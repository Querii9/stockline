// App state + persistence. Everything lives in the browser (localStorage).
import { CONFIG } from "./config.js";
import { forecastAll } from "./forecast.js";
import { isoDate, uid } from "./utils.js";

const DATA_KEY = "stockline.data.v1";
const PREFS_KEY = "stockline.prefs.v1";
const API_KEY = "stockline.apiKey";

// localStorage can throw (private mode, blocked storage): the app keeps working in memory.
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let state = { items: [], movements: [], meta: {} };
let revision = 0;
let batching = 0;
let dirty = false;
const listeners = new Set();

export const getState = () => state;
export const getRevision = () => revision;
export const getItem = (id) => state.items.find((item) => item.id === id);
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function commit() {
  if (batching) {
    dirty = true;
    return;
  }
  revision++;
  storage.set(DATA_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

/** Group several changes into a single save + re-render. */
export function batch(fn) {
  batching++;
  try {
    return fn();
  } finally {
    batching--;
    if (!batching && dirty) {
      dirty = false;
      commit();
    }
  }
}

/** Run an arbitrary change on the state object, then save. */
export function mutate(fn) {
  fn(state);
  commit();
}

export function loadState() {
  const raw = storage.get(DATA_KEY);
  if (!raw) return false;
  try {
    state = sanitize(JSON.parse(raw));
    revision++;
    return true;
  } catch {
    return false;
  }
}

export function replaceAll(data) {
  state = sanitize(data);
  commit();
}

/** Validates imported/stored data and fills defaults. Throws on garbage. */
export function sanitize(data) {
  if (!data || !Array.isArray(data.items)) throw new Error("Invalid data");
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : fallback);
  const items = data.items
    .filter((i) => i && i.id && i.name)
    .map((i) => ({
      ...i,
      id: String(i.id),
      name: String(i.name),
      emoji: i.emoji || "📦",
      category: i.category || "other",
      unit: i.unit || "u.",
      qty: Math.max(0, Math.round(num(i.qty))),
      minQty: i.minQty === null || i.minQty === undefined || i.minQty === "" ? null : num(i.minQty),
      leadTimeDays: num(i.leadTimeDays, CONFIG.forecast.defaultLeadTimeDays),
      price: num(i.price),
      createdAt: i.createdAt || new Date().toISOString(),
    }));
  const ids = new Set(items.map((i) => i.id));
  const movements = (Array.isArray(data.movements) ? data.movements : [])
    .filter((m) => m && ids.has(m.itemId) && (m.type === "in" || m.type === "out") && num(m.qty) > 0)
    .map((m) => ({ ...m, id: m.id || uid("mov"), qty: Math.round(num(m.qty)), date: m.date || new Date().toISOString() }));
  return { items, movements, meta: data.meta && typeof data.meta === "object" ? data.meta : {} };
}

export function exportJSON() {
  return JSON.stringify({ app: "stockline", version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

// ── Items ────────────────────────────────────────────────────────────

export function addItem(data) {
  const item = {
    id: uid("itm"),
    emoji: "📦",
    category: CONFIG.categories[0]?.id ?? "other",
    unit: "u.",
    qty: 0,
    minQty: null,
    leadTimeDays: CONFIG.forecast.defaultLeadTimeDays,
    price: 0,
    supplier: "",
    supplierEmail: "",
    location: "",
    sku: "",
    createdAt: new Date().toISOString(),
    ...data,
  };
  state.items.push(item);
  commit();
  return item;
}

export function updateItem(id, patch) {
  const item = getItem(id);
  if (!item) return;
  Object.assign(item, patch);
  commit();
}

export function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  state.movements = state.movements.filter((m) => m.itemId !== id);
  commit();
}

// ── Movements ────────────────────────────────────────────────────────

/** list: [{ itemId, type: "in"|"out", qty, note?, source? }] */
export function addMovements(list) {
  let added = 0;
  for (const m of list) {
    const item = getItem(m.itemId);
    const qty = Math.round(Number(m.qty) || 0);
    if (!item || qty <= 0 || (m.type !== "in" && m.type !== "out")) continue;
    // An "out" bigger than the recorded stock means the record was wrong: log it, floor stock at 0.
    item.qty = m.type === "in" ? item.qty + qty : Math.max(0, item.qty - qty);
    state.movements.push({
      id: uid("mov"),
      itemId: item.id,
      type: m.type,
      qty,
      note: m.note ?? "",
      source: m.source ?? "manual",
      date: new Date().toISOString(),
    });
    added++;
  }
  if (added) commit();
  return added;
}

/** Physical stock count: records the difference as an "adjust" movement (ignored by the forecast). */
export function adjustStock(itemId, newQty, note) {
  const item = getItem(itemId);
  const target = Math.max(0, Math.round(Number(newQty)));
  if (!item || !Number.isFinite(target) || target === item.qty) return;
  const diff = target - item.qty;
  state.movements.push({
    id: uid("mov"),
    itemId,
    type: diff > 0 ? "in" : "out",
    qty: Math.abs(diff),
    note,
    source: "adjust",
    date: new Date().toISOString(),
  });
  item.qty = target;
  commit();
}

// ── Forecasts (memoised per change and per day) ──────────────────────

let cache = { revision: -1, day: "", map: new Map() };

export function getForecasts() {
  const day = isoDate(new Date());
  if (cache.revision !== revision || cache.day !== day) {
    cache = { revision, day, map: forecastAll(state.items, state.movements) };
  }
  return cache.map;
}

// ── Preferences & API key ────────────────────────────────────────────

export function getPrefs() {
  try {
    return JSON.parse(storage.get(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function setPrefs(patch) {
  storage.set(PREFS_KEY, JSON.stringify({ ...getPrefs(), ...patch }));
}

export const getApiKey = () => storage.get(API_KEY) ?? "";
export const hasApiKey = () => Boolean(getApiKey());
export const setApiKey = (key) => (key ? storage.set(API_KEY, key.trim()) : storage.remove(API_KEY));
export const getModel = () => getPrefs().model ?? CONFIG.ai.model;
