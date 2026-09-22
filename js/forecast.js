// The "death line" maths. Pure functions: no DOM, no storage, no AI.
//
//   usage rate   = weighted average of units used per day (recent days count more)
//   days left    = stock / usage rate
//   death line   = stock-out date − supplier lead time − safety days
//                  (the last day you can order and still receive it before running out)
import { CONFIG } from "./config.js";
import { addDays, daysBetween, isoDate, round, startOfDay } from "./utils.js";

export const STATUS_RANK = { out: 0, critical: 1, warning: 2, ok: 3, dead: 4 };
export const AT_RISK = new Set(["out", "critical", "warning"]);

export function forecastItem(item, movements, today = new Date(), cfg = CONFIG.forecast) {
  const t0 = startOfDay(today);
  const windowDays = cfg.windowDays;
  const half = Math.floor(windowDays / 2);

  let recent = 0; // units used in the most recent half of the window
  let older = 0; // units used in the older half
  let last7 = 0;
  let prevWeeks = 0; // units used from day 7 to the end of the window (baseline for spikes)
  let lastOut = null;
  let firstSeen = item.createdAt ? new Date(item.createdAt) : t0;

  for (const m of movements) {
    const date = new Date(m.date);
    if (date < firstSeen) firstSeen = date;
    // Stock counts ("adjust") correct the number, they are not real usage.
    if (m.type !== "out" || m.source === "adjust") continue;
    const age = daysBetween(date, t0);
    if (age < 0) continue;
    if (!lastOut || date > lastOut) lastOut = date;
    if (age < half) recent += m.qty;
    else if (age < windowDays) older += m.qty;
    if (age < 7) last7 += m.qty;
    else if (age < windowDays) prevWeeks += m.qty;
  }

  const observedDays = daysBetween(firstSeen, t0) + 1;
  let rate;
  if (observedDays >= windowDays) {
    const w = cfg.recentWeight;
    rate = (w * recent + older) / (w * half + (windowDays - half));
  } else {
    // New item: plain average over the days we know about (at least a week).
    rate = (recent + older) / Math.max(observedDays, 7);
  }
  const olderRate = older / (windowDays - half);
  const trend = observedDays >= windowDays && olderRate > 0 ? recent / half / olderRate - 1 : null;
  const usualWeekly = observedDays >= windowDays ? (prevWeeks / (windowDays - 7)) * 7 : rate * 7;

  const qty = Math.max(0, Number(item.qty) || 0);
  const lead = Number(item.leadTimeDays ?? cfg.defaultLeadTimeDays) || 0;
  const daysLeft = rate > 0 ? qty / rate : Infinity;
  const finite = Number.isFinite(daysLeft);
  const daysToDeathLine = finite ? Math.floor(daysLeft) - lead - cfg.safetyDays : Infinity;
  const idleDays = daysBetween(lastOut ?? firstSeen, t0);

  let status;
  if (qty <= 0) status = "out";
  else if (rate === 0) status = idleDays >= cfg.deadStockDays ? "dead" : "ok";
  else if (daysToDeathLine <= 0) status = "critical";
  else if (daysToDeathLine <= cfg.warningDays) status = "warning";
  else status = "ok";
  // The classic manual threshold still works as a safety net.
  if (item.minQty != null && qty > 0 && qty <= item.minQty && (status === "ok" || status === "dead")) status = "warning";

  return {
    rate,
    trend,
    last7,
    usualWeekly,
    daysLeft,
    daysToDeathLine,
    stockoutDate: finite ? addDays(t0, Math.floor(daysLeft)) : null,
    deathLineDate: finite ? addDays(t0, daysToDeathLine) : null,
    status,
    idleDays,
    lastOut,
    leadTimeDays: lead,
    suggestedQty: rate > 0 ? Math.max(0, Math.ceil(rate * (lead + cfg.coverDays) - qty)) : 0,
    value: qty * (Number(item.price) || 0),
  };
}

export function forecastAll(items, movements, today = new Date()) {
  const byItem = new Map(items.map((i) => [i.id, []]));
  for (const m of movements) byItem.get(m.itemId)?.push(m);
  return new Map(items.map((i) => [i.id, forecastItem(i, byItem.get(i.id), today)]));
}

const diff = (a, b) => (a === b ? 0 : a - b);

/** Most urgent first. */
export function compareUrgency(a, b) {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || diff(a.daysToDeathLine, b.daysToDeathLine);
}

export function categoryLabel(id, lang) {
  const cat = CONFIG.categories.find((c) => c.id === id);
  return cat ? cat.label[lang] ?? cat.label.en ?? id : id;
}

/** Compact JSON view of the inventory + forecasts that gets sent to Claude. */
export function buildSnapshot(state, forecasts, lang, today = new Date()) {
  const finite = (n, digits = 1) => (Number.isFinite(n) ? round(n, digits) : null);
  const names = new Map(state.items.map((i) => [i.id, i.name]));
  return {
    today: isoDate(today),
    currency: CONFIG.currency,
    items: state.items.map((i) => {
      const f = forecasts.get(i.id);
      return {
        id: i.id,
        name: i.name,
        category: categoryLabel(i.category, lang),
        unit: i.unit,
        qty: i.qty,
        min_qty: i.minQty,
        unit_price: i.price,
        supplier: i.supplier || null,
        supplier_email: i.supplierEmail || null,
        sku: i.sku || null,
        lead_time_days: f.leadTimeDays,
        rate_per_day: finite(f.rate, 2),
        trend_pct: f.trend === null ? null : Math.round(f.trend * 100),
        out_last_7_days: f.last7,
        usual_weekly_out: finite(f.usualWeekly),
        days_left: finite(f.daysLeft),
        stockout_date: f.stockoutDate ? isoDate(f.stockoutDate) : null,
        death_line: f.deathLineDate ? isoDate(f.deathLineDate) : null,
        days_to_death_line: finite(f.daysToDeathLine, 0),
        status: f.status,
        suggested_order_qty: f.suggestedQty,
        idle_days: f.idleDays,
        stock_value: round(f.value, 2),
      };
    }),
    recent_movements: [...state.movements]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 40)
      .map((m) => ({ date: isoDate(m.date), item: names.get(m.itemId), type: m.type, qty: m.qty, note: m.note || undefined })),
  };
}
