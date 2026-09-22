import { CONFIG } from "../config.js";
import { aiErrorMessage, analyzeInventory, isLive, modelLabel, parseMovementText } from "../ai.js";
import { compareUrgency } from "../forecast.js";
import { fmtDate, fmtMoney, fmtRel, getLang, t, th } from "../i18n.js";
import { getForecasts, getItem, getRevision, getState } from "../store.js";
import { icon, on, rerender, toast, withBusy } from "../ui.js";
import { esc } from "../utils.js";
import { queueChatPrompt } from "./chat.js";
import { openReview, pickPhoto, startPhotoFlow } from "./review.js";

const HORIZON = 30; // days shown on the death line chart

let analysis = null; // { result, demo, model, revision, lang }
let analyzing = false;

export function renderDashboard(root) {
  const { items } = getState();
  const forecasts = getForecasts();
  const all = items.map((item) => ({ item, f: forecasts.get(item.id) }));
  const count = (...statuses) => all.filter(({ f }) => statuses.includes(f.status)).length;
  const dead = all.filter(({ f }) => f.status === "dead");
  const totalValue = all.reduce((sum, { f }) => sum + f.value, 0);

  // In demo mode the "analysis" is local and free, so keep it always up to date.
  if (!analyzing && !isLive() && items.length && (!analysis || isStale())) queueMicrotask(runAnalysis);

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${th("dash.title")}</h1>
        <p class="muted">${th("app.tagline")}</p>
      </div>
      <p class="page-date">${esc(fmtDate(new Date(), "long"))}</p>
    </section>

    <section class="kpis">
      ${kpi("critical", th("dash.kpi.critical"), count("critical", "out"), th("dash.kpi.criticalSub"), "#/inventory?status=critical")}
      ${kpi("warning", th("dash.kpi.warning"), count("warning"), th("dash.kpi.warningSub", { n: CONFIG.forecast.warningDays }), "#/inventory?status=warning")}
      ${kpi("value", th("dash.kpi.value"), esc(fmtMoney(totalValue)), th("dash.kpi.valueSub", { n: items.length }), "#/inventory?sort=value")}
      ${kpi("dead", th("dash.kpi.dead"), esc(fmtMoney(dead.reduce((s, { f }) => s + f.value, 0))), th("dash.kpi.deadSub", { n: dead.length, d: CONFIG.forecast.deadStockDays }), "#/inventory?status=dead")}
    </section>

    <section class="dash-grid">
      <div class="stack">
        ${quickCard()}
        ${deathLineCard(all)}
      </div>
      <div class="stack">${analysisCard()}</div>
    </section>`;
}

function kpi(kind, label, value, sub, href) {
  return `<a class="card kpi" data-kind="${kind}" href="${href}">
    <span class="kpi-label"><i class="dot"></i>${label}</span>
    <span class="kpi-value num">${value}</span>
    <span class="kpi-sub">${sub}</span>
  </a>`;
}

function quickCard() {
  return `<div class="card">
    <h2 class="card-title">${icon("sparkles")} ${th("dash.quick.title")}</h2>
    <form class="quick-form" data-submit="quick-parse">
      <textarea class="input" name="text" rows="2" required data-enter-submit placeholder="${th("dash.quick.placeholder")}"></textarea>
      <div class="row wrap">
        <button class="btn btn-ai" type="submit">${icon("sparkles", 16)} ${th("dash.quick.submit")}</button>
        <button class="btn" type="button" data-action="photo-pick">${icon("camera", 16)} ${th("dash.quick.photo")}</button>
        <button class="btn btn-link" type="button" data-action="photo-sample">${th("dash.quick.sample")}</button>
      </div>
      <p class="hint">${th("dash.quick.hint")}</p>
    </form>
  </div>`;
}

function deathLineCard(all) {
  const rows = all
    .filter(({ f }) => f.status === "out" || (Number.isFinite(f.daysToDeathLine) && f.daysToDeathLine <= HORIZON && f.status !== "dead"))
    .sort((a, b) => compareUrgency(a.f, b.f))
    .slice(0, 8);
  const pct = (days) => Math.max(0, Math.min(100, (days / HORIZON) * 100));

  const body = rows.length
    ? `<div class="dl-axis"><span></span><div class="dl-ticks">${[0, 7, 14, 21, 30]
        .map((d) => `<span style="left:${pct(d)}%">${d === 0 ? th("common.today") : `+${d}${th("common.dayShort")}`}</span>`)
        .join("")}</div><span></span></div>
      ${rows.map(({ item, f }) => deathLineRow(item, f, pct)).join("")}
      <div class="dl-legend">
        <span><i class="legend-bar"></i>${th("dash.dl.bar")}</span>
        <span class="legend-skull">${icon("skull", 14)} ${th("dash.dl.skull")}</span>
      </div>`
    : `<p class="empty">${th("dash.dl.empty")}</p>`;

  return `<div class="card">
    <div class="card-head">
      <h2 class="card-title">${icon("skull")} ${th("dash.dl.title")}</h2>
      <a class="btn btn-sm btn-ghost" href="#/inventory?status=risk">${th("common.seeAll")}</a>
    </div>
    <p class="hint">${th("dash.dl.help", { n: CONFIG.forecast.safetyDays })}</p>
    ${body}
  </div>`;
}

function deathLineRow(item, f, pct) {
  const color = f.status === "out" ? "critical" : f.status;
  const overdue = f.daysToDeathLine <= 0;
  let when;
  if (f.status === "out") when = `<strong>${th("status.out")}</strong>`;
  else if (f.daysToDeathLine === 0) when = `<strong>${th("common.today")}</strong>`;
  else if (overdue) when = `<strong>${esc(fmtRel(f.daysToDeathLine))}</strong>`;
  else when = `<strong>${esc(fmtDate(f.deathLineDate))}</strong><small>${esc(fmtRel(f.daysToDeathLine))}</small>`;

  const skull =
    f.status === "out"
      ? ""
      : `<span class="dl-skull ${overdue ? "overdue" : ""}" style="left:${Math.max(2, Math.min(98, pct(f.daysToDeathLine)))}%" title="${th("dash.dl.skull")}: ${esc(fmtDate(f.deathLineDate))}">${icon("skull", 13)}</span>`;

  return `<button class="dl-row" type="button" data-action="open-item" data-id="${esc(item.id)}" aria-label="${esc(item.name)}" style="--c: var(--${color})">
    <span class="dl-name"><span class="emoji">${esc(item.emoji)}</span><span class="truncate">${esc(item.name)}</span></span>
    <span class="dl-track">
      <span class="dl-fill" style="width:${f.status === "out" ? 0 : pct(f.daysLeft)}%"></span>
      ${skull}
    </span>
    <span class="dl-when ${overdue ? "late" : ""}">${when}</span>
  </button>`;
}

const isStale = () => analysis && (analysis.revision !== getRevision() || analysis.lang !== getLang());

/** Forget the last analysis (e.g. after the API key or the data set changes). */
export function resetAnalysis() {
  analysis = null;
}

function analysisCard() {
  const stale = isStale();
  let body;
  if (analyzing) {
    body = `<div class="thinking"><span class="spinner"></span>${th("dash.analysis.working")}</div>
      <div class="skeleton" style="width:70%"></div><div class="skeleton"></div><div class="skeleton" style="width:85%"></div>`;
  } else if (analysis) {
    body = analysisBody(analysis);
  } else {
    body = `<p class="muted">${th("dash.analysis.intro")}</p>`;
  }
  return `<div class="card analysis">
    <div class="card-head">
      <h2 class="card-title">${icon("sparkles")} ${th("dash.analysis.title")}</h2>
      <button class="btn btn-sm btn-ai" type="button" data-action="run-analysis" ${analyzing ? "disabled" : ""}>
        ${analysis ? icon("refresh", 15) + th("dash.analysis.rerun") : icon("sparkles", 15) + th("dash.analysis.button")}
      </button>
    </div>
    ${stale && !analyzing ? `<p class="notice">${th("dash.analysis.stale")}</p>` : ""}
    ${body}
  </div>`;
}

function analysisBody({ result, demo, model }) {
  const note = demo
    ? `<p class="demo-note">${icon("info", 15)}<span>${th("dash.analysis.demoNote")} <button class="btn-link" type="button" data-action="open-settings">${th("common.addKey")}</button></span></p>`
    : `<p class="model-note">${icon("sparkles", 14)} ${th("dash.analysis.by", { model: modelLabel(model) })}</p>`;
  const actions = result.actions
    .map((a) => {
      const item = getItem(a.item_id);
      return `<li class="an-action" data-priority="${esc(a.priority)}">
        <div class="an-top">
          <span class="prio" data-p="${esc(a.priority)}">${th(`priority.${a.priority}`)}</span>
          <strong class="truncate">${item ? `${esc(item.emoji)} ${esc(item.name)}` : esc(a.item_id)}</strong>
        </div>
        <p class="an-text">${esc(a.action)}</p>
        <p class="an-reason">${esc(a.reason)}</p>
        ${
          item
            ? `<div class="row">
                <button class="btn btn-sm" type="button" data-action="open-item" data-id="${esc(item.id)}">${th("common.view")}</button>
                <button class="btn btn-sm" type="button" data-action="draft-order" data-id="${esc(item.id)}" data-qty="${Number(a.order_qty) || 0}">${icon("mail", 14)} ${th("dash.analysis.draft")}</button>
              </div>`
            : ""
        }
      </li>`;
    })
    .join("");
  const insights = result.insights?.length
    ? `<div class="an-insights"><h3>${th("dash.analysis.insights")}</h3><ul>${result.insights.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`
    : "";
  return `${note}
    <h3 class="an-headline">${esc(result.headline)}</h3>
    <p class="an-summary">${esc(result.summary)}</p>
    ${actions ? `<ol class="an-actions">${actions}</ol>` : ""}
    ${insights}`;
}

async function runAnalysis() {
  analyzing = true;
  rerender();
  try {
    const res = await analyzeInventory();
    analysis = { ...res, revision: getRevision(), lang: getLang() };
  } catch (err) {
    toast(aiErrorMessage(err), "error", 6000);
  } finally {
    analyzing = false;
    rerender();
  }
}

on("click", {
  "run-analysis": () => runAnalysis(),
  "photo-pick": () => pickPhoto(),
  "photo-sample": () => startPhotoFlow({ sample: true }),
  "draft-order": (el) => {
    const item = getItem(el.dataset.id);
    if (!item) return;
    queueChatPrompt(t("chat.draftPrompt", { qty: el.dataset.qty, unit: item.unit, name: item.name }));
    location.hash = "#/chat";
  },
});

on("submit", {
  "quick-parse": async (form) => {
    const text = form.text.value.trim();
    if (!text) return;
    await withBusy(form.querySelector("[type=submit]"), async () => {
      try {
        const res = await parseMovementText(text);
        openReview({
          kind: "text",
          proposals: res.movements,
          unclear: res.unclear,
          demo: res.demo,
          onApplied: () => {
            if (form.isConnected) form.reset();
          },
        });
      } catch (err) {
        toast(aiErrorMessage(err), "error", 6000);
      }
    });
  },
});
