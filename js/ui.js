// UI building blocks: icons, event delegation, modals, toasts.
import { th } from "./i18n.js";
import { esc } from "./utils.js";

// ── Icons (inline SVG, stroke-based) ─────────────────────────────────
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  arrows: '<path d="M4 7h14l-3-3"/><path d="M20 17H6l3 3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sparkles: '<path d="M11 3l1.9 4.6L17.5 9.5l-4.6 1.9L11 16l-1.9-4.6L4.5 9.5l4.6-1.9Z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M4 12 20 4l-6 16-2-6-8-2Z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.5 3 5.6V20h10v-3.4c1.8-1.1 3-3 3-5.6a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11.5" r="1.5"/><circle cx="15" cy="11.5" r="1.5"/><path d="M10.5 20v-2M13.5 20v-2"/>',
  trendUp: '<path d="m4 16 6-6 4 4 6-6"/><path d="M15 8h5v5"/>',
  trendDown: '<path d="m4 8 6 6 4-4 6 6"/><path d="M15 16h5v-5"/>',
};

export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

export const statusPill = (status) => `<span class="pill" data-status="${status}">${th(`status.${status}`)}</span>`;

// ── Event delegation: views register named handlers, markup references them ──
//   <button data-action="name">   <form data-submit="name">   <select data-change="name">   <input data-input="name">
const handlers = { click: {}, submit: {}, change: {}, input: {} };

export function on(type, map) {
  Object.assign(handlers[type], map);
}

export function bindDelegation() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    const fn = el && handlers.click[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-submit]");
    if (!form) return;
    e.preventDefault();
    handlers.submit[form.dataset.submit]?.(form, e);
  });
  for (const type of ["change", "input"]) {
    document.addEventListener(type, (e) => {
      const el = e.target.closest(`[data-${type}]`);
      if (el) handlers[type][el.dataset[type]]?.(el, e);
    });
  }
  // Enter sends, Shift+Enter adds a new line.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target.matches("[data-enter-submit]")) {
      e.preventDefault();
      e.target.form?.requestSubmit();
    }
  });
}

// ── Re-render hook (set by app.js, so views don't import app.js) ──────
let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
export const rerender = () => renderer();

// ── Modals (native <dialog>) ──────────────────────────────────────────
export function openModal({ title, body, footer = "", size = "", onClose } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = `modal ${size}`;
  dialog.innerHTML = `
    <div class="modal-head">
      <h2>${title}</h2>
      <button class="icon-btn" type="button" data-close aria-label="${th("common.close")}">${icon("x")}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
  document.body.append(dialog);

  const close = () => dialog.open && dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === dialog) close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    onClose?.();
  });
  dialog.showModal();
  return { el: dialog, close, body: dialog.querySelector(".modal-body"), foot: dialog.querySelector(".modal-foot") };
}

export function confirmDialog(message, { confirmLabel, danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const modal = openModal({
      title: "",
      size: "small",
      body: `<p class="confirm-text">${esc(message)}</p>`,
      footer: `<button class="btn" type="button" data-close>${th("common.cancel")}</button>
        <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" type="button" data-confirm>${esc(confirmLabel ?? "OK")}</button>`,
      onClose: () => resolve(answer),
    });
    modal.el.querySelector("[data-confirm]").addEventListener("click", () => {
      answer = true;
      modal.close();
    });
  });
}

export function promptNumber(title, label, value) {
  return new Promise((resolve) => {
    let answer = null;
    const modal = openModal({
      title: esc(title),
      size: "small",
      body: `<form id="prompt-form" class="stack-sm">
        <label class="field">${esc(label)}<input class="input" type="number" name="amount" min="0" step="1" value="${esc(value)}" required></label>
      </form>`,
      footer: `<button class="btn" type="button" data-close>${th("common.cancel")}</button>
        <button class="btn btn-primary" type="submit" form="prompt-form">${th("common.save")}</button>`,
      onClose: () => resolve(answer),
    });
    const form = modal.el.querySelector("form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      answer = Number(form.amount.value);
      modal.close();
    });
    form.amount.select();
  });
}

// ── Toasts ────────────────────────────────────────────────────────────
export function toast(message, type = "info", ms = 3400) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Disable a button and show a spinner while a promise runs. */
export async function withBusy(button, task) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span>${original}`;
  try {
    return await task();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}
