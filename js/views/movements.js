import { fmtDate, fmtNum, fmtRel, fmtTime, t, th } from "../i18n.js";
import { addMovements, getItem, getState } from "../store.js";
import { icon, on, openModal, toast } from "../ui.js";
import { daysBetween, esc, normalize } from "../utils.js";

const LIMIT = 150;
const filters = { q: "", type: "", ai: false };

export function renderMovements(root) {
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${th("mov.title")}</h1>
        <p class="muted">${th("mov.subtitle")}</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-movement">${icon("plus", 16)} ${th("mov.new")}</button>
    </section>
    <div class="toolbar">
      <label class="search">${icon("search", 16)}<input class="input" type="search" data-input="mov-filter" name="q" value="${esc(filters.q)}" placeholder="${th("mov.search")}"></label>
      <div class="segmented" role="group">
        ${[
          ["", th("common.all")],
          ["in", th("mov.in")],
          ["out", th("mov.out")],
        ]
          .map(([value, label]) => `<button type="button" data-action="mov-type" data-value="${value}" class="${filters.type === value ? "active" : ""}">${label}</button>`)
          .join("")}
      </div>
      <label class="toggle"><input type="checkbox" data-change="mov-filter" name="ai" ${filters.ai ? "checked" : ""}> ${icon("sparkles", 15)} ${th("mov.onlyAI")}</label>
    </div>
    <div id="mov-list"></div>`;
  renderList();
}

function renderList() {
  const box = document.getElementById("mov-list");
  if (!box) return;
  const { movements } = getState();
  const q = normalize(filters.q);
  const list = [...movements]
    .filter((m) => {
      if (filters.type && m.type !== filters.type) return false;
      if (filters.ai && !m.source?.startsWith("ai-")) return false;
      if (q && !normalize(`${getItem(m.itemId)?.name} ${m.note}`).includes(q)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    box.innerHTML = `<div class="card"><p class="empty">${th("mov.empty")}</p></div>`;
    return;
  }

  // Group by day: "Avui", "Ahir", then dates.
  const groups = new Map();
  for (const m of list.slice(0, LIMIT)) {
    const age = daysBetween(m.date, new Date());
    const label = age <= 1 ? fmtRel(-age) : fmtDate(m.date, "long");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(m);
  }

  box.innerHTML =
    [...groups]
      .map(
        ([label, items]) => `<section class="card flush mov-group">
          <h2 class="mov-day">${esc(label.charAt(0).toUpperCase() + label.slice(1))}</h2>
          ${items.map(rowHtml).join("")}
        </section>`,
      )
      .join("") + (list.length > LIMIT ? `<p class="muted center small">${th("mov.showing", { n: LIMIT })}</p>` : "");
}

function rowHtml(m) {
  const item = getItem(m.itemId);
  return `<button class="mov-row" type="button" data-action="open-item" data-id="${esc(m.itemId)}">
    <span class="mov-time muted num">${esc(fmtTime(m.date))}</span>
    <span class="mov-item truncate"><span class="emoji">${esc(item?.emoji ?? "📦")}</span> ${esc(item?.name ?? "?")}</span>
    <strong class="qty ${m.type} num">${m.type === "in" ? "+" : "−"}${fmtNum(m.qty)} <small>${esc(item?.unit ?? "")}</small></strong>
    <span class="mov-note truncate muted">${esc(m.note)}</span>
    <span class="src" data-src="${esc(m.source)}">${m.source?.startsWith("ai-") ? icon("sparkles", 12) : ""}${th(`source.${m.source}`)}</span>
  </button>`;
}

export function openMovementForm(itemId = "") {
  const { items } = getState();
  if (!items.length) {
    toast(t("mov.noItems"), "info");
    return;
  }
  openModal({
    title: th("mov.new"),
    size: "small",
    body: `<form id="movement-form" class="stack-sm" data-submit="save-movement">
      <label class="field">${th("mov.item")}
        <select class="input" name="itemId" required>
          ${items
            .map((i) => `<option value="${esc(i.id)}" ${i.id === itemId ? "selected" : ""}>${esc(i.emoji)} ${esc(i.name)} (${fmtNum(i.qty)} ${esc(i.unit)})</option>`)
            .join("")}
        </select>
      </label>
      <div class="segmented big" role="radiogroup">
        <label><input type="radio" name="type" value="out" checked><span>− ${th("mov.out")}</span></label>
        <label><input type="radio" name="type" value="in"><span>+ ${th("mov.in")}</span></label>
      </div>
      <label class="field">${th("mov.qty")}<input class="input" type="number" name="qty" min="1" step="1" value="1" required></label>
      <label class="field">${th("mov.note")}<input class="input" name="note" maxlength="120" placeholder="${th("mov.notePh")}"></label>
    </form>`,
    footer: `<button class="btn" type="button" data-close>${th("common.cancel")}</button>
      <button class="btn btn-primary" type="submit" form="movement-form">${th("common.save")}</button>`,
  });
}

on("input", {
  "mov-filter": (el) => {
    filters.q = el.value;
    renderList();
  },
});

on("change", {
  "mov-filter": (el) => {
    filters.ai = el.checked;
    renderList();
  },
});

on("click", {
  "new-movement": () => openMovementForm(),
  "mov-type": (el) => {
    filters.type = el.dataset.value;
    el.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === el));
    renderList();
  },
});

on("submit", {
  "save-movement": (form) => {
    const data = Object.fromEntries(new FormData(form));
    form.closest("dialog").close();
    addMovements([{ itemId: data.itemId, type: data.type, qty: Number(data.qty), note: data.note.trim(), source: "manual" }]);
    toast(t("mov.saved"), "success");
  },
});
