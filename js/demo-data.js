// Demo inventory with 60 days of realistic history, generated relative to "today"
// so the death lines always look alive. Deterministic: same seed → same data.
import { addDays, startOfDay } from "./utils.js";

const HISTORY_DAYS = 60;

// Fictional suppliers (".test" is a reserved domain, these addresses can't reach anyone).
const SUPPLIERS = {
  tech: { name: "Suministros Ejemplo S.L.", email: "pedidos@suministros-ejemplo.test" },
  office: { name: "Ofi Ejemplo S.L.", email: "comandes@ofi-ejemplo.test" },
  safety: { name: "Protección Ejemplo S.A.", email: "ventas@proteccion-ejemplo.test" },
  pack: { name: "Embalajes Ejemplo S.L.", email: "pedidos@embalajes-ejemplo.test" },
  clean: { name: "Limpiezas Ejemplo S.L.", email: "info@limpiezas-ejemplo.test" },
};

const UNITS = {
  u: { ca: "u.", es: "ud.", en: "pcs" },
  pack: { ca: "paquets", es: "paquetes", en: "packs" },
  pair: { ca: "parells", es: "pares", en: "pairs" },
  roll: { ca: "rotlles", es: "rollos", en: "rolls" },
  bottle: { ca: "ampolles", es: "botellas", en: "bottles" },
};

const NOTES = {
  out: {
    ca: ["Oficina de Barcelona", "Equip de manteniment", "Nova incorporació", "Comanda client", "Magatzem → producció", "Substitució per avaria"],
    es: ["Oficina de Barcelona", "Equipo de mantenimiento", "Nueva incorporación", "Pedido cliente", "Almacén → producción", "Sustitución por avería"],
    en: ["Barcelona office", "Maintenance team", "New starter", "Customer order", "Warehouse → production", "Replacement (faulty)"],
  },
  in: {
    ca: ["Reposició del proveïdor"],
    es: ["Reposición del proveedor"],
    en: ["Supplier restock"],
  },
};

// qty = stock today · rate = average units used per day · lead = supplier lead time (days)
export const DEMO_ITEMS = [
  { id: "itm-headphones", emoji: "🎧", category: "electronics", unit: "u", qty: 4, rate: 1.0, lead: 3, price: 24.9, minQty: 3, supplier: "tech", sku: "BT-500", location: "A-01", weekdays: true,
    name: { ca: "Auriculars Bluetooth", es: "Auriculares Bluetooth", en: "Bluetooth headphones" } },
  { id: "itm-usbc", emoji: "🔌", category: "electronics", unit: "u", qty: 14, rate: 1.2, lead: 4, price: 3.2, supplier: "tech", sku: "UC-1M", location: "A-02", pattern: "rising",
    name: { ca: "Cables USB-C 1 m", es: "Cables USB-C 1 m", en: "USB-C cables 1 m" } },
  { id: "itm-mouse", emoji: "🖱️", category: "electronics", unit: "u", qty: 18, rate: 0.5, lead: 5, price: 14.5, supplier: "tech", sku: "MS-220", location: "A-03", weekdays: true,
    name: { ca: "Ratolins sense fil", es: "Ratones inalámbricos", en: "Wireless mice" } },
  { id: "itm-keyboard", emoji: "⌨️", category: "electronics", unit: "u", qty: 9, rate: 0.25, lead: 5, price: 29.0, supplier: "tech", sku: "KB-110", location: "A-03", weekdays: true,
    name: { ca: "Teclats", es: "Teclados", en: "Keyboards" } },
  { id: "itm-laptops", emoji: "💻", category: "electronics", unit: "u", qty: 4, rate: 0.06, lead: 14, price: 749, supplier: "tech", sku: "NB-14", location: "A-05",
    name: { ca: "Portàtils", es: "Portátiles", en: "Laptops" } },
  { id: "itm-phonecases", emoji: "📱", category: "electronics", unit: "u", qty: 60, rate: 0, lead: 7, price: 6.5, supplier: "tech", sku: "FC-X", location: "A-06", pattern: "idle",
    name: { ca: "Fundes de mòbil", es: "Fundas de móvil", en: "Phone cases" } },
  { id: "itm-batteries", emoji: "🔋", category: "office", unit: "pack", qty: 7, rate: 0.7, lead: 2, price: 4.9, supplier: "office", sku: "AA-4", location: "B-01", pattern: "spike",
    name: { ca: "Piles AA (paquet de 4)", es: "Pilas AA (pack de 4)", en: "AA batteries (4-pack)" } },
  { id: "itm-toner", emoji: "🖨️", category: "office", unit: "u", qty: 2, rate: 0.08, lead: 10, price: 89, supplier: "office", sku: "TN-247", location: "B-02",
    name: { ca: "Tòner impressora", es: "Tóner impresora", en: "Printer toner" } },
  { id: "itm-gloves", emoji: "🧤", category: "safety", unit: "pair", qty: 3, rate: 0.9, lead: 5, price: 2.1, supplier: "safety", sku: "GT-09", location: "C-01",
    name: { ca: "Guants de treball", es: "Guantes de trabajo", en: "Work gloves" } },
  { id: "itm-vests", emoji: "🦺", category: "safety", unit: "u", qty: 14, rate: 0.15, lead: 7, price: 5.8, supplier: "safety", sku: "HV-L", location: "C-02",
    name: { ca: "Armilles reflectants", es: "Chalecos reflectantes", en: "Hi-vis vests" } },
  { id: "itm-boxes", emoji: "📦", category: "packaging", unit: "u", qty: 45, rate: 6, lead: 3, price: 0.85, supplier: "pack", sku: "CX-M", location: "D-01", weekdays: true,
    name: { ca: "Caixes de cartró M", es: "Cajas de cartón M", en: "Cardboard boxes M" } },
  { id: "itm-tape", emoji: "🩹", category: "packaging", unit: "roll", qty: 0, rate: 1.2, lead: 3, price: 1.35, supplier: "pack", sku: "CE-48", location: "D-02", pattern: "empty",
    name: { ca: "Cinta d'embalar", es: "Cinta de embalar", en: "Packing tape" } },
  { id: "itm-labels", emoji: "🏷️", category: "packaging", unit: "roll", qty: 26, rate: 0.7, lead: 4, price: 3.9, supplier: "pack", sku: "ET-100", location: "D-03", weekdays: true,
    name: { ca: "Rotlles d'etiquetes", es: "Rollos de etiquetas", en: "Label rolls" } },
  { id: "itm-sanitizer", emoji: "🧴", category: "cleaning", unit: "bottle", qty: 8, rate: 0.5, lead: 2, price: 3.4, supplier: "clean", sku: "GH-500", location: "E-01",
    name: { ca: "Gel hidroalcohòlic 500 ml", es: "Gel hidroalcohólico 500 ml", en: "Hand sanitizer 500 ml" } },
];

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyRate(d, age, day) {
  if (d.pattern === "idle") return 0;
  if (d.pattern === "empty" && age < 2) return 0; // ran out two days ago
  let rate = d.rate;
  if (d.pattern === "rising") rate *= 1.6 - (1.2 * age) / HISTORY_DAYS;
  if (d.weekdays) {
    const dow = day.getDay();
    rate = dow === 0 || dow === 6 ? 0 : (rate * 7) / 5;
  }
  return rate;
}

export function buildDemoData(lang = "en", now = new Date()) {
  const rnd = mulberry32(42);
  const t0 = startOfDay(now);
  const createdAt = addDays(t0, -(HISTORY_DAYS + 30)).toISOString();
  const items = [];
  const movements = [];
  let counter = 0;

  const movement = (itemId, type, qty, day, restock = false) => {
    const date = new Date(day);
    date.setHours(restock ? 8 : 9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);
    if (date > now) date.setTime(now.getTime() - Math.floor(rnd() * 3_600_000));
    const pool = NOTES[type];
    const idx = Math.floor(rnd() * pool.en.length);
    const withNote = restock || rnd() < 0.45;
    movements.push({
      id: `mov-demo-${++counter}`,
      itemId,
      type,
      qty,
      date: date.toISOString(),
      source: "history",
      note: withNote ? pool[lang]?.[idx] ?? pool.en[idx] : "",
      noteKey: withNote ? `${type}.${idx}` : null,
    });
  };

  for (const d of DEMO_ITEMS) {
    const supplier = SUPPLIERS[d.supplier];
    items.push({
      id: d.id,
      name: d.name[lang] ?? d.name.en,
      emoji: d.emoji,
      category: d.category,
      unit: UNITS[d.unit][lang] ?? UNITS[d.unit].en,
      qty: d.qty,
      minQty: d.minQty ?? null,
      leadTimeDays: d.lead,
      price: d.price,
      supplier: supplier.name,
      supplierEmail: supplier.email,
      location: d.location,
      sku: d.sku,
      createdAt,
      demo: true,
    });

    // Walk backwards from today's stock: undo each day's usage, and insert a restock
    // whenever the reconstructed stock would be unrealistically high.
    let qty = d.qty;
    let carry = rnd() * 0.5;
    const high = Math.max(d.qty + 4, Math.ceil(d.rate * (d.lead + 30)));
    for (let age = 0; age < HISTORY_DAYS; age++) {
      const day = addDays(t0, -age);
      carry += dailyRate(d, age, day) * (0.5 + rnd());
      let used = Math.floor(carry);
      carry -= used;
      if (d.pattern === "spike" && age === 2) used += 8; // unusual week → anomaly insight
      if (d.pattern === "idle" && age === HISTORY_DAYS - 2) used = 2;
      if (used > 0) {
        const parts = used >= 2 && rnd() < 0.35 ? [Math.ceil(used / 2), Math.floor(used / 2)] : [used];
        parts.forEach((q) => movement(d.id, "out", q, day));
        qty += used;
      }
      if (qty > high && age > 2) {
        const low = Math.max(1, Math.round(d.rate * d.lead * (0.6 + rnd() * 0.6)));
        movement(d.id, "in", qty - low, day, true);
        qty = low;
      }
    }
  }

  movements.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { items, movements, meta: { demo: true, demoLang: lang, createdAt: now.toISOString() } };
}

/** When the language changes, rename untouched demo items and notes. */
export function translateDemo(state, lang) {
  for (const item of state.items) {
    const d = DEMO_ITEMS.find((x) => x.id === item.id);
    if (!d || !item.demo) continue;
    if (Object.values(d.name).includes(item.name)) item.name = d.name[lang] ?? d.name.en;
    const units = UNITS[d.unit];
    if (Object.values(units).includes(item.unit)) item.unit = units[lang] ?? units.en;
  }
  for (const m of state.movements) {
    if (!m.noteKey) continue;
    const [type, idx] = m.noteKey.split(".");
    const note = NOTES[type]?.[lang]?.[Number(idx)];
    if (note) m.note = note;
  }
  state.meta.demoLang = lang;
}

/** What the sample delivery note (assets/sample-delivery-note.svg) contains. Used in demo mode. */
export const SAMPLE_NOTE = {
  supplier: "Suministros Ejemplo, S.L.",
  reference: "ALB-2026-0917",
  document_date: "2026-09-15",
  lines: [
    { description: "Auriculares Bluetooth BT-500", qty: 20, unit_price: 24.9, item_id: "itm-headphones" },
    { description: "Cable USB-C 1 m", qty: 50, unit_price: 3.2, item_id: "itm-usbc" },
    { description: "Guantes de trabajo T9 (par)", qty: 30, unit_price: 2.1, item_id: "itm-gloves" },
    { description: "Cinta de embalar 48 mm (rollo)", qty: 36, unit_price: 1.35, item_id: "itm-tape" },
    { description: "Adaptador USB-C a HDMI", qty: 10, unit_price: 12.5, item_id: "" },
  ],
  notes: "",
};
