// Small shared helpers. Everything here is pure except downloadFile().

export const DAY_MS = 86_400_000;

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function isoDate(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape any value before putting it into HTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Lowercase, strip accents and punctuation: "Cables USB-C" → "cables usb c". */
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const round = (n, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Tiny, safe Markdown subset for chat answers: paragraphs, lists, **bold**, *italic*, `code`. */
export function mdLite(source) {
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");

  let html = "";
  let list = null;
  for (const raw of esc(source).split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (list !== type) {
        if (list) html += `</${list}>`;
        html += `<${type}>`;
        list = type;
      }
      html += `<li>${inline((bullet || numbered)[1])}</li>`;
      continue;
    }
    if (list) {
      html += `</${list}>`;
      list = null;
    }
    if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    html += heading ? `<p><strong>${inline(heading[1])}</strong></p>` : `<p>${inline(line)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

export function downloadFile(filename, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
