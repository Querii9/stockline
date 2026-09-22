// Hand-drawn SVG chart (no chart library): past stock level + forecast to the stock-out.
import { fmtDate, fmtNum, t } from "./i18n.js";
import { daysBetween, esc, startOfDay } from "./utils.js";

const PAST = 45;
const FUTURE = 30;

/** Rebuilds end-of-day stock for the last PAST days by undoing movements from today backwards. */
function history(item, movements) {
  const t0 = startOfDay();
  const netByAge = new Map();
  for (const m of movements) {
    if (m.itemId !== item.id) continue;
    const age = daysBetween(m.date, t0);
    if (age < 0 || age > PAST) continue;
    netByAge.set(age, (netByAge.get(age) ?? 0) + (m.type === "in" ? m.qty : -m.qty));
  }
  const points = [];
  let qty = item.qty;
  for (let age = 0; age <= PAST; age++) {
    points.push({ day: -age, qty: Math.max(0, qty) });
    qty -= netByAge.get(age) ?? 0;
  }
  return points.reverse();
}

export function stockChart(item, movements, f) {
  const W = 640;
  const H = 230;
  const pad = { l: 38, r: 18, t: 22, b: 28 };
  const past = history(item, movements);
  const maxQty = Math.max(5, ...past.map((p) => p.qty), item.qty) * 1.15;
  const x = (day) => pad.l + ((day + PAST) / (PAST + FUTURE)) * (W - pad.l - pad.r);
  const y = (qty) => H - pad.b - (qty / maxQty) * (H - pad.t - pad.b);

  // Step line for the history (stock changes in jumps, not smoothly).
  let line = `M ${x(past[0].day)} ${y(past[0].qty)}`;
  for (let i = 1; i < past.length; i++) line += ` H ${x(past[i].day)} V ${y(past[i].qty)}`;
  const area = `${line} V ${y(0)} H ${x(past[0].day)} Z`;

  // Forecast: straight line from today to the stock-out day (or the chart edge).
  const end = Number.isFinite(f.daysLeft) ? Math.min(f.daysLeft, FUTURE) : FUTURE;
  const endQty = Math.max(0, item.qty - f.rate * end);
  const color = `var(--${f.status === "out" ? "critical" : f.status === "dead" ? "dead" : f.status})`;

  const gridValues = [0, 0.5, 1].map((r) => Math.round((maxQty / 1.15) * r));
  const grid = gridValues
    .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="c-grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" class="c-label" text-anchor="end">${fmtNum(v)}</text>`)
    .join("");
  const ticks = [-45, -30, -15, 0, 15, 30]
    .map((d) => `<text x="${x(d)}" y="${H - 8}" class="c-label" text-anchor="middle">${d === 0 ? esc(t("common.today")) : `${d > 0 ? "+" : ""}${d}${esc(t("common.dayShort"))}`}</text>`)
    .join("");

  let markers = "";
  const dl = f.daysToDeathLine;
  if (Number.isFinite(dl) && dl >= -PAST && dl <= FUTURE) {
    markers += `<line x1="${x(dl)}" x2="${x(dl)}" y1="${pad.t}" y2="${y(0)}" class="c-deathline"/>
      <text x="${x(dl)}" y="${pad.t - 8}" class="c-label c-deathline-label" text-anchor="${dl > FUTURE - 8 ? "end" : dl < -PAST + 8 ? "start" : "middle"}">☠ ${esc(t("detail.deathline"))} · ${esc(fmtDate(f.deathLineDate))}</text>`;
  }
  if (Number.isFinite(f.daysLeft) && f.daysLeft <= FUTURE) {
    markers += `<circle cx="${x(f.daysLeft)}" cy="${y(0)}" r="5" class="c-stockout"/>`;
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("detail.chart"))}">
    ${grid}
    <path d="${area}" class="c-area"/>
    <path d="${line}" class="c-line"/>
    <line x1="${x(0)}" x2="${x(end)}" y1="${y(item.qty)}" y2="${y(endQty)}" class="c-forecast" style="stroke:${color}"/>
    <line x1="${x(0)}" x2="${x(0)}" y1="${pad.t}" y2="${y(0)}" class="c-today"/>
    <circle cx="${x(0)}" cy="${y(item.qty)}" r="4.5" class="c-now"/>
    ${markers}
    ${ticks}
  </svg>`;
}
