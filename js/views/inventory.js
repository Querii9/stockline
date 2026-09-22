import { CONFIG } from "../config.js";
import { stockChart } from "../charts.js";
import { buildDemoData } from "../demo-data.js";
import { AT_RISK, categoryLabel, compareUrgency } from "../forecast.js";
import { fmtDate, fmtMoney, fmtNum, fmtRel, fmtTime, getLang, t, th } from "../i18n.js";
import { addItem, addMovements, adjustStock, batch, deleteItem, getForecasts, getItem, getState, replaceAll, updateItem } from "../store.js";
import { confirmDialog, icon, on, openModal, promptNumber, statusPill, toast } from "../ui.js";
import { esc, normalize } from "../utils.js";
import { openMovementForm } from "./movements.js";

const filters = { q: "", category: "", status: "", sort: "urgency" };

export function renderInventory(root) {
  // Filters can come from links such as #/inventory?status=critical
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (params.has("status")) filters.status = params.get("status");
  if (params.has("sort")) filters.sort = params.get("sort");
  if (params.size) history.replaceState(null, "", "#/inventory");

  const { items } = getState();
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${label}</option>`;

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${th("inv.title")}</h1>
        <p class="muted">${th("inv.subtitle", { n: items.length, d: CONFIG.forecast.windowDays })}</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-item">${icon("plus", 16)} ${th("inv.new")}</button>
    </section>

    <div class="toolbar">
      <label class="search">${icon("search", 16)}<input class="input" type="search" data-input="inv-filter" name="q" value="${esc(filters.q)}" placeholder="${th("inv.search")}"></label>
      <select class="input" data-change="inv-filter" name="category">
        ${option("", th("inv.allCategories"), filters.category)}
        ${CONFIG.categories.map((c) => option(c.id, esc(categoryLabel(c.id, getLang())), filters.category)).join("")}
      </select>
      <select class="input" data-change="inv-filter" name="status">
        ${option("", th("inv.allStatus"), filters.status)}
        ${option("risk", th("inv.atRisk"), filters.status)}
        ${["out", "critical", "warning", "ok", "dead"].map((s) => option(s, th(`status.${s}`), filters.status)).join("")}
      </select>
      <select class="input" data-change="inv-filter" name="sort">
        ${["urgency", "name", "qty", "value"].map((s) => option(s, th(`inv.sort.${s}`), filters.sort)).join("")}
      </select>
    </div>

    <div class="card flush">
      <div class="inv-head">
        <span>${th("inv.col.item")}</span><span>${th("inv.col.stock")}</span><span>${th("inv.col.rate")}</span>
        <span>${th("inv.col.dl")}</span><span>${th("inv.col.status")}</span>
      </div>
      <div id="inv-rows"></div>
    </div>`;
  renderRows();
}

function renderRows() {
  const box = document.getElementById("inv-rows");
  if (!box) return;
  const { items } = getState();
  const forecasts = getForecasts();

  if (!items.length) {
    box.innerHTML = `<div class="empty">${th("inv.emptyAll")}
      <div class="row center"><button class="btn" type="button" data-action="load-demo">${th("inv.loadDemo")}</button>
      <button class="btn btn-primary" type="button" data-action="new-item">${icon("plus", 16)} ${th("inv.new")}</button></div></div>`;
    return;
  }

  const q = normalize(filters.q);
  const rows = items
    .map((item) => ({ item, f: forecasts.get(item.id) }))
    .filter(({ item, f }) => {
      if (q && !normalize(`${item.name} ${item.sku} ${item.supplier} ${item.location}`).includes(q)) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (filters.status === "risk") return AT_RISK.has(f.status);
      if (filters.status === "critical") return f.status === "critical" || f.status === "out";
      return !filters.status || f.status === filters.status;
    })
    .sort((a, b) => {
      if (filters.sort === "name") return a.item.name.localeCompare(b.item.name, getLang());
      if (filters.sort === "qty") return a.item.qty - b.item.qty;
      if (filters.sort === "value") return b.f.value - a.f.value;
      return compareUrgency(a.f, b.f);
    });

  box.innerHTML = rows.length ? rows.map(({ item, f }) => rowHtml(item, f)).join("") : `<p class="empty">${th("inv.empty")}</p>`;
}

function rowHtml(item, f) {
  let trend = "";
  if (f.trend !== null && Math.abs(f.trend) >= 0.15) {
    const up = f.trend > 0;
    const pct = Math.round(f.trend * 100);
    trend = `<span class="trend ${up ? "up" : "down"}" title="${th(up ? "inv.trendUp" : "inv.trendDown", { n: pct })}">${icon(up ? "trendUp" : "trendDown", 14)}</span>`;
  }
  let deathLine = `<span class="muted">—</span>`;
  if (f.status === "out") deathLine = `<strong class="late">${th("status.out")}</strong>`;
  else if (f.deathLineDate) {
    deathLine = `<strong class="${f.daysToDeathLine <= 0 ? "late" : ""}">${esc(fmtDate(f.deathLineDate))}</strong><small>${esc(fmtRel(f.daysToDeathLine))}</small>`;
  }

  return `<div class="inv-row" role="button" tabindex="0" data-action="open-item" data-id="${esc(item.id)}">
    <div class="inv-item">
      <span class="emoji big">${esc(item.emoji)}</span>
      <div class="truncate">
        <strong class="truncate">${esc(item.name)}</strong>
        <small class="muted truncate">${esc(categoryLabel(item.category, getLang()))}${item.location ? ` · ${esc(item.location)}` : ""}${item.sku ? ` · ${esc(item.sku)}` : ""}</small>
      </div>
    </div>
    <div class="inv-stock">
      <button class="step" type="button" data-action="quick-move" data-type="out" data-id="${esc(item.id)}" title="${th("inv.quickOut")}" ${item.qty ? "" : "disabled"}>${icon("minus", 14)}</button>
      <span class="num"><strong>${fmtNum(item.qty)}</strong> <small>${esc(item.unit)}</small></span>
      <button class="step" type="button" data-action="quick-move" data-type="in" data-id="${esc(item.id)}" title="${th("inv.quickIn")}">${icon("plus", 14)}</button>
    </div>
    <div class="inv-rate">${f.rate > 0 ? `<span class="num">${th("common.perDay", { n: fmtNum(f.rate, 1) })}</span>${trend}` : `<span class="muted">${th("inv.noUsage")}</span>`}</div>
    <div class="inv-dl">${deathLine}</div>
    <div class="inv-status">${statusPill(f.status)}</div>
  </div>`;
}

// ── Item detail ───────────────────────────────────────────────────────

export function openItem(id) {
  const item = getItem(id);
  if (!item) return;
  const f = getForecasts().get(id);
  const { movements } = getState();
  const recent = movements
    .filter((m) => m.itemId === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  const stat = (label, value, cls = "") => `<div class="stat ${cls}"><small>${label}</small><strong>${value}</strong></div>`;
  const finite = Number.isFinite(f.daysLeft);

  openModal({
    title: `<span class="emoji">${esc(item.emoji)}</span> ${esc(item.name)}`,
    size: "wide",
    body: `
      <div class="detail-top">${statusPill(f.status)}
        <span class="muted">${esc(categoryLabel(item.category, getLang()))}${item.supplier ? ` · ${esc(item.supplier)}` : ""}${item.location ? ` · ${esc(item.location)}` : ""}</span>
      </div>
      <div class="stats">
        ${stat(th("detail.stock"), `${fmtNum(item.qty)} <small>${esc(item.unit)}</small>`)}
        ${stat(th("detail.rate"), f.rate > 0 ? th("common.perDay", { n: fmtNum(f.rate, 2) }) : th("inv.noUsage"))}
        ${stat(th("detail.cover"), finite ? th("common.days", { n: fmtNum(f.daysLeft, 1) }) : "∞")}
        ${stat(th("detail.stockout"), f.stockoutDate ? esc(fmtDate(f.stockoutDate)) : "—")}
        ${stat(th("detail.deathline"), f.deathLineDate ? `${esc(fmtDate(f.deathLineDate))} <small>${esc(fmtRel(f.daysToDeathLine))}</small>` : "—", f.daysToDeathLine <= 0 ? "late" : "")}
        ${stat(th("detail.suggested"), f.suggestedQty ? `${fmtNum(f.suggestedQty)} <small>${esc(item.unit)}</small>` : "—")}
        ${stat(th("detail.value"), esc(fmtMoney(f.value)))}
      </div>
      <h3 class="section-title">${th("detail.chart")}</h3>
      <div class="chart-box">${stockChart(item, movements, f)}</div>
      <h3 class="section-title">${th("detail.history")}</h3>
      ${
        recent.length
          ? `<ul class="mini-moves">${recent
              .map(
                (m) => `<li><span class="muted">${esc(fmtDate(m.date))} · ${esc(fmtTime(m.date))}</span>
                  <strong class="qty ${m.type}">${m.type === "in" ? "+" : "−"}${fmtNum(m.qty)}</strong>
                  <span class="truncate">${esc(m.note)}</span>
                  <span class="src">${th(`source.${m.source}`)}</span></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">${th("detail.noHistory")}</p>`
      }`,
    footer: `
      <button class="btn btn-ghost danger" type="button" data-action="delete-item" data-id="${esc(id)}">${icon("trash", 16)} ${th("common.delete")}</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-action="adjust-item" data-id="${esc(id)}">${th("detail.adjust")}</button>
      <button class="btn" type="button" data-action="edit-item" data-id="${esc(id)}">${icon("edit", 16)} ${th("common.edit")}</button>
      <button class="btn btn-primary" type="button" data-action="move-item" data-id="${esc(id)}">${icon("arrows", 16)} ${th("mov.new")}</button>`,
  });
}

// ── Create / edit form ────────────────────────────────────────────────

function openItemForm(item) {
  const isNew = !item;
  const v = item ?? { emoji: "📦", category: CONFIG.categories[0]?.id, unit: t("item.unitDefault"), leadTimeDays: CONFIG.forecast.defaultLeadTimeDays, qty: 0, price: 0 };
  const field = (label, input, cls = "") => `<label class="field ${cls}">${label}${input}</label>`;
  const text = (name, value, extra = "") => `<input class="input" name="${name}" value="${esc(value ?? "")}" ${extra}>`;
  const number = (name, value, extra = "") => `<input class="input" type="number" name="${name}" value="${esc(value ?? "")}" min="0" ${extra}>`;

  openModal({
    title: th(isNew ? "item.new" : "item.edit"),
    body: `<form id="item-form" class="form-grid" data-submit="save-item" data-id="${esc(item?.id ?? "")}">
      ${field(th("item.name"), text("name", v.name, 'required maxlength="80" autofocus'), "span-2")}
      ${field(th("item.emoji"), text("emoji", v.emoji, 'maxlength="8"'))}
      ${field(th("item.category"), `<select class="input" name="category">${CONFIG.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === v.category ? "selected" : ""}>${esc(categoryLabel(c.id, getLang()))}</option>`).join("")}</select>`)}
      ${isNew ? field(th("item.qty"), number("qty", v.qty, 'step="1"')) : ""}
      ${field(th("item.unit"), text("unit", v.unit, 'maxlength="16"'))}
      ${field(th("item.leadTime"), number("leadTimeDays", v.leadTimeDays, 'step="1"'))}
      ${field(th("item.minQty"), number("minQty", v.minQty, 'step="1"'))}
      ${field(th("item.price"), number("price", v.price, 'step="0.01"'))}
      ${field(th("item.sku"), text("sku", v.sku))}
      ${field(th("item.supplier"), text("supplier", v.supplier))}
      ${field(th("item.supplierEmail"), text("supplierEmail", v.supplierEmail, 'type="email"'))}
      ${field(th("item.location"), text("location", v.location))}
    </form>`,
    footer: `<button class="btn" type="button" data-close>${th("common.cancel")}</button>
      <button class="btn btn-primary" type="submit" form="item-form">${th("common.save")}</button>`,
  });
}

// ── Actions ───────────────────────────────────────────────────────────

const closeModals = () => document.querySelectorAll("dialog[open]").forEach((d) => d.close());

on("input", {
  "inv-filter": (el) => {
    filters[el.name] = el.value;
    renderRows();
  },
});

on("change", {
  "inv-filter": (el) => {
    filters[el.name] = el.value;
    renderRows();
  },
});

on("click", {
  "open-item": (el) => openItem(el.dataset.id),
  "new-item": () => openItemForm(null),
  "edit-item": (el) => {
    closeModals();
    openItemForm(getItem(el.dataset.id));
  },
  "move-item": (el) => {
    closeModals();
    openMovementForm(el.dataset.id);
  },
  "quick-move": (el) => {
    const item = getItem(el.dataset.id);
    if (!item) return;
    addMovements([{ itemId: item.id, type: el.dataset.type, qty: 1, source: "manual" }]);
    toast(t(el.dataset.type === "out" ? "inv.movedOut" : "inv.movedIn", { name: item.name, n: item.qty }), "success", 2200);
  },
  "adjust-item": async (el) => {
    const item = getItem(el.dataset.id);
    closeModals();
    const value = await promptNumber(t("detail.adjust"), t("detail.adjustLabel"), item.qty);
    if (value === null || !Number.isFinite(value)) return;
    adjustStock(item.id, value, t("detail.adjustNote"));
    toast(t("detail.adjusted"), "success");
  },
  "delete-item": async (el) => {
    const item = getItem(el.dataset.id);
    closeModals();
    if (!(await confirmDialog(t("item.deleteConfirm", { name: item.name }), { confirmLabel: t("common.delete"), danger: true }))) return;
    deleteItem(item.id);
    toast(t("item.deleted"), "success");
  },
  "load-demo": () => replaceAll(buildDemoData(getLang())),
});

// Keyboard access for the clickable rows.
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".inv-row")) {
    e.preventDefault();
    openItem(e.target.dataset.id);
  }
});

on("submit", {
  "save-item": (form) => {
    const data = Object.fromEntries(new FormData(form));
    const num = (v, fallback = 0) => (v === "" || v === undefined ? fallback : Math.max(0, Number(v)));
    const patch = {
      name: data.name.trim(),
      emoji: data.emoji.trim() || "📦",
      category: data.category,
      unit: data.unit.trim() || t("item.unitDefault"),
      leadTimeDays: num(data.leadTimeDays, CONFIG.forecast.defaultLeadTimeDays),
      minQty: data.minQty === "" ? null : num(data.minQty),
      price: num(data.price),
      sku: data.sku.trim(),
      supplier: data.supplier.trim(),
      supplierEmail: data.supplierEmail.trim(),
      location: data.location.trim(),
    };
    if (!patch.name) return;
    closeModals();
    if (form.dataset.id) {
      updateItem(form.dataset.id, patch);
      toast(t("item.saved"), "success");
    } else {
      batch(() => {
        const item = addItem(patch);
        const qty = Math.round(num(data.qty));
        if (qty > 0) addMovements([{ itemId: item.id, type: "in", qty, note: t("item.initialStock"), source: "adjust" }]);
      });
      toast(t("item.created"), "success");
    }
  },
});
