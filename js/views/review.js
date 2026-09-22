// Human-in-the-loop: whatever the AI proposes (from text or a photo) is shown here
// to be checked and edited before it touches the stock.
import { aiErrorMessage, isLive, readDeliveryNote } from "../ai.js";
import { fmtDate, t, th } from "../i18n.js";
import { addItem, addMovements, batch, getItem, getState } from "../store.js";
import { icon, on, openModal, toast } from "../ui.js";
import { esc } from "../utils.js";

const SAMPLE_URL = "assets/sample-delivery-note.svg";

let current = null; // { rows, kind, demo, meta, modal, onApplied }

/**
 * proposals: [{ item_id, item_name, type: "in"|"out", qty, note, unit_price? }]
 * kind: "text" | "photo"
 */
export function openReview({ kind, proposals, unclear = "", demo = false, meta = {}, image = null, onApplied }) {
  const rows = proposals.map((p) => {
    const exists = p.item_id && getItem(p.item_id);
    const itemId = exists ? p.item_id : "new";
    return {
      itemId,
      newName: p.item_name || t("item.new"),
      type: p.type === "in" ? "in" : "out",
      qty: Math.max(1, Math.round(Number(p.qty) || 1)),
      note: p.note || "",
      unitPrice: Number(p.unit_price) || 0,
      on: !(itemId === "new" && p.type !== "in"),
    };
  });

  const metaBits = [
    meta.supplier && `<span><small>${th("review.supplier")}</small>${esc(meta.supplier)}</span>`,
    meta.reference && `<span><small>${th("review.reference")}</small>${esc(meta.reference)}</span>`,
    meta.date && `<span><small>${th("review.date")}</small>${esc(safeDate(meta.date))}</span>`,
  ].filter(Boolean);

  const body = `
    ${demo ? `<p class="demo-note">${icon("info", 15)}<span>${th(kind === "photo" ? "review.demoPhoto" : "review.demoText")}</span></p>` : ""}
    <div class="${image ? "review-split" : ""}">
      ${image ? `<figure class="review-image"><img src="${esc(image)}" alt=""></figure>` : ""}
      <div>
        ${metaBits.length ? `<div class="review-meta">${metaBits.join("")}</div>` : ""}
        ${unclear ? `<p class="notice">${esc(unclear)}</p>` : ""}
        ${rows.length ? `<p class="muted small">${th("review.intro")}</p>` : `<p class="empty">${th("review.none")}</p>`}
        <form id="review-form" class="review-rows" data-submit="review-apply">
          ${rows.map((r, i) => rowHtml(r, i)).join("")}
        </form>
      </div>
    </div>`;

  const modal = openModal({
    title: `${icon(kind === "photo" ? "camera" : "sparkles")} ${th(kind === "photo" ? "review.titlePhoto" : "review.titleText")}`,
    size: image ? "wide" : "",
    body,
    footer: `<button class="btn" type="button" data-close>${th("common.cancel")}</button>
      <button class="btn btn-primary" type="submit" form="review-form" id="review-apply" ${rows.length ? "" : "disabled"}>${th("review.apply", { n: rows.filter((r) => r.on).length })}</button>`,
    onClose: () => (current = null),
  });
  current = { rows, kind, demo, meta, modal, onApplied };
  rows.forEach((_, i) => refreshRow(i));
}

function rowHtml(r, i) {
  const { items } = getState();
  const options = items
    .map((item) => `<option value="${esc(item.id)}" ${item.id === r.itemId ? "selected" : ""}>${esc(item.emoji)} ${esc(item.name)}</option>`)
    .join("");
  const newOption = r.newName ? `<option value="new" ${r.itemId === "new" ? "selected" : ""}>${th("review.newItem", { name: r.newName })}</option>` : "";
  return `<div class="review-row" data-i="${i}">
    <input type="checkbox" class="check" data-change="review-row" name="on" ${r.on ? "checked" : ""} aria-label="✓">
    <select class="input" data-change="review-row" name="type">
      <option value="out" ${r.type === "out" ? "selected" : ""}>− ${th("mov.out")}</option>
      <option value="in" ${r.type === "in" ? "selected" : ""}>+ ${th("mov.in")}</option>
    </select>
    <input class="input qty" type="number" min="1" step="1" data-change="review-row" name="qty" value="${r.qty}" aria-label="${th("mov.qty")}">
    <select class="input item" data-change="review-row" name="item">${newOption}${options}</select>
    <input class="input note" data-change="review-row" name="note" value="${esc(r.note)}" placeholder="${th("mov.note")}">
    <p class="review-warn" data-warn></p>
  </div>`;
}

function refreshRow(i) {
  const r = current.rows[i];
  const el = current.modal.el.querySelector(`.review-row[data-i="${i}"]`);
  let warning = "";
  if (r.itemId === "new" && r.type === "out") warning = t("review.newOut");
  else if (r.type === "out") {
    const item = getItem(r.itemId);
    if (item && r.qty > item.qty) warning = t("review.notEnough", { n: item.qty });
  }
  el.querySelector("[data-warn]").textContent = warning;
  el.classList.toggle("off", !r.on);
  const count = current.rows.filter((row) => row.on && !(row.itemId === "new" && row.type === "out")).length;
  const apply = current.modal.el.querySelector("#review-apply");
  apply.textContent = t("review.apply", { n: count });
  apply.disabled = count === 0;
}

on("change", {
  "review-row": (el) => {
    if (!current) return;
    const i = Number(el.closest(".review-row").dataset.i);
    const r = current.rows[i];
    if (el.name === "on") r.on = el.checked;
    if (el.name === "type") r.type = el.value;
    if (el.name === "qty") r.qty = Math.max(1, Math.round(Number(el.value) || 1));
    if (el.name === "item") r.itemId = el.value;
    if (el.name === "note") r.note = el.value;
    refreshRow(i);
  },
});

on("submit", {
  "review-apply": () => {
    if (!current) return;
    const { rows, kind, demo, meta, modal, onApplied } = current;
    const source = kind === "photo" ? (demo ? "photo" : "ai-photo") : demo ? "text" : "ai-text";
    const docNote = meta.reference ? t("review.noteFromDoc", { ref: meta.reference }) : "";
    const valid = rows.filter((r) => r.on && !(r.itemId === "new" && r.type === "out"));

    const added = batch(() => {
      const createdByName = new Map();
      const movements = valid.map((r) => {
        let itemId = r.itemId;
        if (itemId === "new") {
          // Two lines for the same new product end up in the same new item.
          itemId =
            createdByName.get(r.newName) ??
            addItem({ name: r.newName, unit: t("item.unitDefault"), category: "other", price: r.unitPrice, supplier: meta.supplier || "" }).id;
          createdByName.set(r.newName, itemId);
        }
        return { itemId, type: r.type, qty: r.qty, note: r.note || docNote, source };
      });
      return addMovements(movements);
    });

    modal.close();
    toast(t("review.applied", { n: added }), "success");
    onApplied?.();
  },
});

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : fmtDate(date);
}

// ── Photos ─────────────────────────────────────────────────────────────

export function pickPhoto() {
  if (!isLive()) {
    const modal = openModal({
      title: `${icon("camera")} ${th("photo.title")}`,
      size: "small",
      body: `<p>${th("photo.demoOnly")}</p>`,
      footer: `<button class="btn" type="button" data-close data-action="open-settings">${th("common.addKey")}</button>
        <button class="btn btn-primary" type="button" data-sample>${th("dash.quick.sample")}</button>`,
    });
    modal.el.querySelector("[data-sample]").addEventListener("click", () => {
      modal.close();
      startPhotoFlow({ sample: true });
    });
    return;
  }
  document.getElementById("photo-input").click();
}

document.getElementById("photo-input")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) startPhotoFlow({ file });
});

export async function startPhotoFlow({ file, sample = false }) {
  let image;
  try {
    image = sample ? await rasterize(SAMPLE_URL, "image/png") : await rasterize(URL.createObjectURL(file), "image/jpeg");
  } catch {
    toast(t("photo.badImage"), "error");
    return;
  }

  const modal = openModal({
    title: `${icon("camera")} ${th("photo.title")}`,
    size: "wide",
    body: `<div class="scan scanning"><img src="${image.dataUrl}" alt=""></div>
      <p class="thinking"><span class="spinner"></span>${th("photo.reading")}</p>`,
  });

  try {
    const res = await readDeliveryNote({ base64: image.base64, mediaType: image.mediaType });
    if (!modal.el.open) return; // closed while reading
    modal.close();
    openReview({
      kind: "photo",
      proposals: res.lines.map((l) => ({ item_id: l.item_id, item_name: l.description, type: "in", qty: l.qty, note: "", unit_price: l.unit_price })),
      meta: { supplier: res.supplier, reference: res.reference, date: res.document_date },
      unclear: res.notes,
      demo: res.demo,
      image: image.dataUrl,
    });
  } catch (err) {
    modal.close();
    toast(aiErrorMessage(err), "error", 6000);
  }
}

/** Loads any image URL, downsizes it (max 1600 px) and returns base64 ready for the API. */
function rasterize(url, mediaType, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL(mediaType, 0.85);
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], mediaType });
    };
    img.onerror = reject;
    img.src = url;
  });
}
