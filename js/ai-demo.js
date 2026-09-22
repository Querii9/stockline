// Demo mode: what the AI features do when there is no API key.
// Everything is rules + templates over the real forecasts, and the UI labels it as such.
import { SAMPLE_NOTE } from "./demo-data.js";
import { AT_RISK, compareUrgency } from "./forecast.js";
import { fmtDate, fmtMoney, fmtNum, fmtRel, t } from "./i18n.js";
import { daysBetween, normalize, wait } from "./utils.js";

const rows = (state, forecasts) => state.items.map((item) => ({ item, f: forecasts.get(item.id) }));
const atRisk = (state, forecasts) =>
  rows(state, forecasts)
    .filter(({ f }) => AT_RISK.has(f.status))
    .sort((a, b) => compareUrgency(a.f, b.f));
const isSpike = (f) => f.last7 >= 1.6 * f.usualWeekly && f.last7 - f.usualWeekly >= 3;
const orderQty = (f) => Math.max(f.suggestedQty, 1);

function reasonFor(item, f) {
  const vars = { date: f.stockoutDate && fmtDate(f.stockoutDate), lead: f.leadTimeDays, rate: fmtNum(f.rate, 1) };
  if (f.status === "out") return t("demo.reasonOut", vars);
  if (f.daysToDeathLine < 0) return t("demo.reasonLate", { ...vars, when: fmtRel(f.daysToDeathLine) });
  if (f.daysToDeathLine === 0) return t("demo.reasonToday", vars);
  return t("demo.reasonSoon", { ...vars, date: fmtDate(f.deathLineDate), when: fmtRel(f.daysToDeathLine) });
}

function insights(state, forecasts) {
  const all = rows(state, forecasts);
  const list = [];
  const dead = all.filter(({ f }) => f.status === "dead").sort((a, b) => b.f.value - a.f.value)[0];
  if (dead) list.push(t("demo.insightDead", { value: fmtMoney(dead.f.value), name: dead.item.name, days: dead.f.idleDays }));
  const spike = all.filter(({ f }) => f.rate > 0 && isSpike(f)).sort((a, b) => b.f.last7 / b.f.usualWeekly - a.f.last7 / a.f.usualWeekly)[0];
  if (spike)
    list.push(t("demo.insightSpike", { n: spike.f.last7, unit: spike.item.unit, name: spike.item.name, avg: fmtNum(spike.f.usualWeekly, 0) }));
  const rising = all.filter(({ f }) => f.trend >= 0.2 && !isSpike(f)).sort((a, b) => b.f.trend - a.f.trend)[0];
  if (rising) list.push(t("demo.insightTrend", { name: rising.item.name, pct: Math.round(rising.f.trend * 100) }));
  return list;
}

export async function demoAnalysis(state, forecasts) {
  await wait(600);
  const risky = atRisk(state, forecasts);
  const critical = risky.filter(({ f }) => f.status !== "warning").length;
  const headline =
    risky.length === 0 ? t("demo.headlineOk") : risky.length === 1 ? t("demo.headlineOne") : t("demo.headlineRisk", { n: risky.length });
  return {
    headline,
    summary: risky.length ? t("demo.summary", { critical, warning: risky.length - critical, name: risky[0].item.name }) : t("demo.summaryOk"),
    actions: risky.slice(0, 6).map(({ item, f }) => ({
      item_id: item.id,
      priority: f.status === "warning" ? "soon" : "urgent",
      order_qty: orderQty(f),
      action: t(item.supplier ? "demo.action" : "demo.actionNoSupplier", { qty: orderQty(f), unit: item.unit, supplier: item.supplier }),
      reason: reasonFor(item, f),
    })),
    insights: insights(state, forecasts),
  };
}

// ── Plain-text movements: a small rule-based parser ──────────────────

const OUT_WORDS =
  /\b(tret|treure|trec|tragut|sortit|sortides?|agaf\w*|gast\w*|venut|venc|enviat|envi[eo]\w*|utilitz\w*|servir|consumi\w*|perdut|trencat|donat|sacad\w*|saco|sacar|salid\w*|cog\w*|coj\w*|vendid\w*|vendo|usad\w*|utiliz\w*|perdid\w*|rot[oa]s?|took|taken?|used|sold|sent|remov\w*|grabb\w*|gave|given|handed|broke\w*|lost)\b/;
const IN_WORDS =
  /\b(entra\w*|arriba\w*|arribat|rebu\w*|rebo|rebem|compra\w*|afegi\w*|afege\w*|retorna\w*|reposa\w*|llega\w*|llegad\w*|recib\w*|anad\w*|devuel\w*|repuest\w*|repong\w*|receiv\w*|arriv\w*|bought|added|returned|restock\w*)\b/;
const NUMBER_WORDS = {
  un: 1, una: 1, uno: 1, one: 1, dos: 2, dues: 2, two: 2, tres: 3, three: 3, quatre: 4, cuatro: 4, four: 4,
  cinc: 5, cinco: 5, five: 5, sis: 6, seis: 6, six: 6, set: 7, siete: 7, seven: 7, vuit: 8, ocho: 8, eight: 8,
  nou: 9, nueve: 9, nine: 9, deu: 10, diez: 10, ten: 10, dotze: 12, doce: 12, twelve: 12, dozen: 12, vint: 20, veinte: 20, twenty: 20,
};
const STOP = new Set("he has ha hem han i y and de del dels la les el els los las the a an of per para for amb con with al a l d unes uns unos unas some".split(" "));

const stem = (w) => w.replace(/(es|s)$/, "");
const tokens = (text) => normalize(text).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

function matchItem(clauseTokens, items) {
  let best = null;
  for (const item of items) {
    const nameTokens = tokens(item.name);
    const score = nameTokens.filter((n) => clauseTokens.some((c) => c.slice(0, 4) === n.slice(0, 4) && (c.startsWith(n) || n.startsWith(c)))).length;
    if (score && (!best || score > best.score || (score === best.score && item.name.length < best.item.name.length))) best = { item, score };
  }
  return best?.item ?? null;
}

export async function demoParse(text, items) {
  await wait(350);
  let raw = text.trim();
  let note = "";
  // "… per a l'oficina" / "… para la oficina" / "… for the office" → note
  const noteMatch = raw.match(/\s(?:per a|per al|pel|per|para el|para la|para|for the|for)\s+(.+)$/i);
  if (noteMatch) {
    note = noteMatch[1].trim();
    raw = raw.slice(0, noteMatch.index);
  }
  const source = normalize(raw);

  let direction = "out";
  const movements = [];
  for (const clause of source.split(/\s(?:i|y|and|amb)\s|\s\+\s/)) {
    if (OUT_WORDS.test(clause)) direction = "out";
    else if (IN_WORDS.test(clause)) direction = "in";
    const words = clause.split(" ");
    const numberAt = words.findIndex((w) => /^\d+$/.test(w) || NUMBER_WORDS[w]);
    if (numberAt === -1) continue;
    const qty = /^\d+$/.test(words[numberAt]) ? Number(words[numberAt]) : NUMBER_WORDS[words[numberAt]];
    const rest = words.slice(numberAt + 1).join(" ");
    const item = matchItem(tokens(rest), items);
    const cleanName = rest.replace(OUT_WORDS, "").replace(IN_WORDS, "").trim();
    movements.push({
      item_id: item?.id ?? "",
      item_name: item?.name ?? cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      type: direction,
      qty,
      note: note && note.charAt(0).toUpperCase() + note.slice(1),
    });
  }
  return { movements, unclear: movements.length ? "" : t("review.none") };
}

// ── Delivery note: canned answer for the sample document ─────────────

export async function demoDeliveryNote(items) {
  await wait(1600);
  const ids = new Set(items.map((i) => i.id));
  return { ...SAMPLE_NOTE, lines: SAMPLE_NOTE.lines.map((l) => ({ ...l, item_id: ids.has(l.item_id) ? l.item_id : "" })) };
}

// ── Chat: answers the suggested questions with rules ─────────────────

const INTENTS = [
  ["draft", /esborrany|borrador|draft|correu|correo|email|mail|redacta/],
  ["dead", /parat|parado|dead|immobilitz|inmoviliz|idle|diners|dinero|money|tied/],
  ["risk", /risc|riesgo|risk|urgent|critic|perill|peligro/],
  ["buy", /demanar|demano|compra|pedir|pido|order|buy|necessit|necesit/],
  ["value", /valor|value|worth|val /],
];

export function demoChat(question, state, forecasts) {
  const q = normalize(question) + " ";
  const intent = INTENTS.find(([, re]) => re.test(q))?.[0];
  const risky = atRisk(state, forecasts);
  const today = new Date();

  switch (intent) {
    case "draft": {
      const mentioned = matchItem(tokens(question), state.items);
      const target = mentioned ?? risky[0]?.item ?? state.items[0];
      if (!target) return t("chat.demoFallback");
      const sameSupplier = risky.filter(({ item }) => item.supplier && item.supplier === target.supplier).map(({ item }) => item);
      const list = [target, ...sameSupplier.filter((i) => i.id !== target.id)];
      const lines = list
        .map((i) => t("demo.draftLine", { qty: orderQty(forecasts.get(i.id)), unit: i.unit, name: i.name, sku: i.sku || "—" }))
        .join("\n");
      const f = forecasts.get(target.id);
      const deadline = f.stockoutDate && f.stockoutDate > today ? f.stockoutDate : new Date(today.getTime() + 2 * 86_400_000);
      return t("demo.draft", { name: target.name, supplier: target.supplier || "—", lines, date: fmtDate(deadline, "day") });
    }
    case "dead": {
      const dead = rows(state, forecasts).filter(({ f }) => f.status === "dead");
      if (!dead.length) return t("demo.chatDeadNone");
      const total = dead.reduce((sum, { f }) => sum + f.value, 0);
      return [
        t("demo.chatDead", { value: fmtMoney(total) }),
        "",
        ...dead.map(({ item, f }) => "- " + t("demo.chatDeadLine", { name: item.name, qty: item.qty, unit: item.unit, value: fmtMoney(f.value), days: f.idleDays })),
      ].join("\n");
    }
    case "risk": {
      if (!risky.length) return t("demo.chatBuyNone");
      return [
        t("demo.chatRisk"),
        "",
        ...risky.slice(0, 3).map(({ item, f }) =>
          "- " +
          t("demo.chatRiskLine", {
            name: item.name,
            qty: item.qty,
            unit: item.unit,
            when: f.stockoutDate ? fmtRel(daysBetween(today, f.stockoutDate)) : "—",
            status: t(`status.${f.status}`),
          }),
        ),
      ].join("\n");
    }
    case "buy": {
      const week = risky.filter(({ f }) => f.daysToDeathLine <= 7);
      if (!week.length) return t("demo.chatBuyNone");
      return [
        t("demo.chatBuy"),
        "",
        ...week.map(({ item, f }) =>
          "- " + t("demo.chatBuyLine", { name: item.name, qty: orderQty(f), unit: item.unit, supplier: item.supplier || "—", when: fmtRel(Math.max(f.daysToDeathLine, -99)) }),
        ),
      ].join("\n");
    }
    case "value": {
      const total = rows(state, forecasts).reduce((sum, { f }) => sum + f.value, 0);
      return t("demo.chatValue", { value: fmtMoney(total), n: state.items.length });
    }
    default:
      return t("chat.demoFallback");
  }
}
