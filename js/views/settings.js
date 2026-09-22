import { CONFIG } from "../config.js";
import { aiErrorMessage, modelLabel, testConnection } from "../ai.js";
import { buildDemoData, translateDemo } from "../demo-data.js";
import { categoryLabel } from "../forecast.js";
import { LANGS, getLang, setLang, t, th } from "../i18n.js";
import { exportJSON, getApiKey, getForecasts, getModel, getPrefs, getState, mutate, replaceAll, setApiKey, setPrefs } from "../store.js";
import { confirmDialog, icon, on, openModal, rerender, toast, withBusy } from "../ui.js";
import { downloadFile, esc, isoDate, round } from "../utils.js";
import { resetAnalysis } from "./dashboard.js";

let modal = null;

export function openSettings() {
  modal?.close();
  modal = openModal({ title: `${icon("sliders")} ${th("settings.title")}`, body: body(), onClose: () => (modal = null) });
}

function refresh() {
  if (modal) modal.body.innerHTML = body();
}

const mask = (key) => `${key.slice(0, 10)}…${key.slice(-4)}`;

function body() {
  const key = getApiKey();
  const model = getModel();
  const theme = getPrefs().theme ?? "auto";
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;

  return `
    <section class="settings-section">
      <h3>${icon("sparkles", 16)} ${th("settings.ai")}</h3>
      <p class="ai-state ${key ? "live" : "demo"}"><i class="dot"></i>${key ? th("settings.aiLive", { model: modelLabel(model) }) : th("settings.aiDemo")}</p>
      <form class="key-row" data-submit="save-key" autocomplete="off">
        <input class="input" type="password" name="key" spellcheck="false" autocomplete="off"
          placeholder="${key ? esc(mask(key)) : "sk-ant-…"}" aria-label="${th("settings.apiKey")}">
        <button class="btn btn-primary" type="submit">${th("settings.saveKey")}</button>
      </form>
      <p class="hint">${th("settings.apiKeyHelp")}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">${th("settings.apiKeyGet")} ↗</a></p>
      <div class="row wrap">
        <label class="field grow">${th("settings.model")}
          <select class="input" data-change="set-model">${CONFIG.ai.models.map((m) => option(m.id, m.label, model)).join("")}</select>
        </label>
      </div>
      ${
        key
          ? `<div class="row wrap">
              <button class="btn" type="button" data-action="test-key">${th("settings.test")}</button>
              <button class="btn btn-ghost danger" type="button" data-action="remove-key">${th("settings.removeKey")}</button>
            </div>`
          : ""
      }
    </section>

    <section class="settings-section">
      <h3>${th("settings.appearance")}</h3>
      <div class="form-grid">
        <label class="field">${th("settings.language")}
          <select class="input" data-change="set-lang">${LANGS.map((l) => option(l.id, l.label, getLang())).join("")}</select>
        </label>
        <label class="field">${th("settings.theme")}
          <select class="input" data-change="set-theme">
            ${option("auto", t("settings.themeAuto"), theme)}${option("light", t("settings.themeLight"), theme)}${option("dark", t("settings.themeDark"), theme)}
          </select>
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h3>${th("settings.data")}</h3>
      <p class="hint">${th("settings.dataHelp")}</p>
      <div class="row wrap">
        <button class="btn" type="button" data-action="export-json">${icon("download", 16)} ${th("settings.exportJson")}</button>
        <button class="btn" type="button" data-action="export-csv">${icon("download", 16)} ${th("settings.exportCsv")}</button>
        <button class="btn" type="button" data-action="import-json">${icon("upload", 16)} ${th("settings.import")}</button>
      </div>
      <div class="row wrap">
        <button class="btn" type="button" data-action="reset-demo">${icon("refresh", 16)} ${th("settings.resetDemo")}</button>
        <button class="btn btn-ghost danger" type="button" data-action="wipe-data">${icon("trash", 16)} ${th("settings.wipe")}</button>
      </div>
    </section>`;
}

/** Applies the saved theme ("auto" follows the operating system). */
export function applyTheme() {
  const theme = getPrefs().theme ?? "auto";
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function changeLanguage(lang) {
  setLang(lang);
  if (getState().meta.demo) mutate((state) => translateDemo(state, lang));
  rerender();
}

function csvExport() {
  const forecasts = getForecasts();
  const header = ["name", "sku", "category", "qty", "unit", "rate_per_day", "days_left", "stockout_date", "death_line", "status", "suggested_order_qty", "unit_price", "stock_value", "supplier", "location"];
  const cell = (v) => (/[",\n;]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const lines = getState().items.map((i) => {
    const f = forecasts.get(i.id);
    return [
      i.name, i.sku, categoryLabel(i.category, getLang()), i.qty, i.unit, round(f.rate, 2),
      Number.isFinite(f.daysLeft) ? round(f.daysLeft, 1) : "", f.stockoutDate ? isoDate(f.stockoutDate) : "",
      f.deathLineDate ? isoDate(f.deathLineDate) : "", f.status, f.suggestedQty, i.price, round(f.value, 2), i.supplier, i.location,
    ].map(cell).join(",");
  });
  // BOM so Excel opens accents correctly.
  return "﻿" + [header.join(","), ...lines].join("\n");
}

on("submit", {
  "save-key": (form) => {
    const key = form.key.value.trim();
    if (!key) return;
    setApiKey(key);
    resetAnalysis();
    toast(t("settings.apiKeySaved"), "success");
    refresh();
    rerender();
  },
});

on("change", {
  "set-model": (el) => {
    setPrefs({ model: el.value });
    refresh();
    rerender();
  },
  "set-lang": (el) => {
    changeLanguage(el.value);
    refresh();
    if (modal) modal.el.querySelector(".modal-head h2").innerHTML = `${icon("sliders")} ${th("settings.title")}`;
  },
  "set-theme": (el) => {
    setPrefs({ theme: el.value });
    applyTheme();
    rerender();
  },
});

on("click", {
  "open-settings": () => openSettings(),
  "test-key": (el) =>
    withBusy(el, async () => {
      try {
        const model = await testConnection();
        toast(t("settings.testOk", { model: modelLabel(model) }), "success");
      } catch (err) {
        toast(aiErrorMessage(err), "error", 6000);
      }
    }),
  "remove-key": () => {
    setApiKey("");
    resetAnalysis();
    toast(t("settings.apiKeyRemoved"), "info");
    refresh();
    rerender();
  },
  "export-json": () => downloadFile(`stockline-${isoDate(new Date())}.json`, exportJSON(), "application/json"),
  "export-csv": () => downloadFile(`stockline-${isoDate(new Date())}.csv`, csvExport(), "text/csv;charset=utf-8"),
  "import-json": () => document.getElementById("import-input").click(),
  "reset-demo": async () => {
    if (!(await confirmDialog(t("settings.resetConfirm"), { confirmLabel: t("common.continue") }))) return;
    resetAnalysis();
    replaceAll(buildDemoData(getLang()));
    toast(t("settings.resetDone"), "success");
  },
  "wipe-data": async () => {
    if (!(await confirmDialog(t("settings.wipeConfirm"), { confirmLabel: t("settings.wipe"), danger: true }))) return;
    resetAnalysis();
    replaceAll({ items: [], movements: [], meta: {} });
    toast(t("settings.wiped"), "success");
  },
});

document.getElementById("import-input")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    replaceAll({ ...data, meta: { ...(data.meta ?? {}), demo: false } });
    resetAnalysis();
    toast(t("settings.imported"), "success");
  } catch {
    toast(t("settings.importFail"), "error");
  }
});
