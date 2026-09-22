// AI layer. Every feature has two paths:
//   · live → Claude API, called straight from the browser with the user's own key
//   · demo → rules/samples from ai-demo.js when there is no key
// The views never need to know which one ran: results carry a `demo` flag.
import { CONFIG } from "./config.js";
import * as demo from "./ai-demo.js";
import { buildSnapshot } from "./forecast.js";
import { getLang, t } from "./i18n.js";
import { getApiKey, getForecasts, getModel, getState, hasApiKey } from "./store.js";
import { isoDate, wait } from "./utils.js";

export class AIError extends Error {
  constructor(code, detail = "") {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

const LANGUAGE_NAMES = { ca: "Catalan", es: "Spanish", en: "English" };
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);
const supportsEffort = (model) => !/haiku|sonnet-4-5|opus-4-1|claude-3/.test(model);

export const isLive = () => hasApiKey();
export const modelLabel = (id) => CONFIG.ai.models.find((m) => m.id === id)?.label ?? id;

// ── Client ───────────────────────────────────────────────────────────

let sdkPromise = null;

function loadSdk() {
  // Loaded lazily from a CDN so the app needs no build step and demo mode never downloads it.
  sdkPromise ??= import(CONFIG.ai.sdkUrl)
    .then((mod) => mod.default ?? mod.Anthropic)
    .catch((err) => {
      sdkPromise = null;
      throw new AIError("sdk", err.message);
    });
  return sdkPromise;
}

async function getClient() {
  const Anthropic = await loadSdk();
  // The key never leaves this browser except to go to api.anthropic.com.
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
  return { Anthropic, client };
}

function requestParams(task) {
  const model = getModel();
  const params = { model, max_tokens: 16000 };
  const effort = CONFIG.ai.effort[task];
  if (effort && supportsEffort(model)) params.output_config = { effort };
  if (CONFIG.ai.refusalFallback && FALLBACK_MODELS.has(model)) {
    // If the model declines, the API re-runs the request on Anthropic's recommended fallback model.
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
}

function toAIError(err, Anthropic) {
  if (err instanceof AIError) return err;
  const message = err?.error?.error?.message ?? err?.message ?? String(err);
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return new AIError("auth");
    if (err instanceof Anthropic.PermissionDeniedError) return new AIError("permission");
    if (err instanceof Anthropic.RateLimitError) return new AIError("rate");
    if (err instanceof Anthropic.BadRequestError) return new AIError("badRequest", message);
    if (err instanceof Anthropic.InternalServerError) return new AIError("server");
    if (err instanceof Anthropic.APIUserAbortError) return new AIError("aborted");
    if (err instanceof Anthropic.APIConnectionError) return new AIError("network");
    if (err instanceof Anthropic.APIError) return new AIError("generic", message);
  }
  return new AIError("generic", message);
}

export function aiErrorMessage(err) {
  const code = err instanceof AIError ? err.code : "generic";
  const known = ["auth", "permission", "rate", "server", "network", "refusal", "truncated", "sdk", "format", "badRequest", "aborted"];
  return t(known.includes(code) ? `err.${code}` : "err.generic", { msg: err?.detail || err?.message || "" });
}

function textOf(message) {
  // A refusal comes back as HTTP 200 with stop_reason "refusal": check before reading content.
  if (message.stop_reason === "refusal") throw new AIError("refusal");
  if (message.stop_reason === "max_tokens") throw new AIError("truncated");
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** One request whose answer must match a JSON schema (structured outputs). */
async function structured(task, { system, content, schema }) {
  const { Anthropic, client } = await getClient();
  const params = requestParams(task);
  params.output_config = { ...params.output_config, format: { type: "json_schema", schema } };
  let message;
  try {
    message = await client.beta.messages.create({ ...params, system, messages: [{ role: "user", content }] });
  } catch (err) {
    throw toAIError(err, Anthropic);
  }
  try {
    return { data: JSON.parse(textOf(message)), model: message.model };
  } catch (err) {
    throw err instanceof AIError ? err : new AIError("format");
  }
}

// ── Prompts ──────────────────────────────────────────────────────────

const language = () => LANGUAGE_NAMES[getLang()] ?? "English";

function inventoryContext(snapshot) {
  const f = CONFIG.forecast;
  return `The app has already computed a forecast for every item. Trust these numbers; don't recompute them.
- rate_per_day: average units used per day over the last ${f.windowDays} days (the most recent half counts ×${f.recentWeight}).
- out_last_7_days vs usual_weekly_out: compare them to spot unusual spikes.
- days_left = qty / rate_per_day. stockout_date = the day it runs out.
- death_line: the last day to place an order without running out = stockout_date − lead_time_days − ${f.safetyDays} safety days.
- status: out (no stock) · critical (death line reached or passed: order today) · warning (death line within ${f.warningDays} days) · ok · dead (no usage for ${f.deadStockDays}+ days, money tied up).
- suggested_order_qty covers the lead time plus ${f.coverDays} days of usage.

Inventory snapshot (JSON, recent_movements newest first):
${JSON.stringify(snapshot)}`;
}

const catalogOf = (items) => JSON.stringify(items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, sku: i.sku || undefined, qty: i.qty })));

const ANALYSIS_PROMPT = `Review the inventory and tell me what to do.
- actions: only items that need attention (out, critical or warning, or a clear anomaly), most urgent first, at most 6. item_id must be an id from the snapshot. priority: "urgent" (order today), "soon" (this week) or "watch". order_qty: normally suggested_order_qty; change it only for a concrete reason and say why.
- action: one short imperative sentence, e.g. "Order 30 today from <supplier>".
- reason: at most 20 words, concrete (dates, days, quantities).
- insights: 1 to 3 short observations a busy person would miss: dead stock and the money tied up in it, rising or falling usage, unusual spikes. No generic advice.
- headline: at most 10 words. summary: at most 2 sentences.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          priority: { type: "string", enum: ["urgent", "soon", "watch"] },
          action: { type: "string" },
          order_qty: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["item_id", "priority", "action", "order_qty", "reason"],
        additionalProperties: false,
      },
    },
    insights: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "summary", "actions", "insights"],
  additionalProperties: false,
};

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    movements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          item_name: { type: "string" },
          type: { type: "string", enum: ["in", "out"] },
          qty: { type: "integer" },
          note: { type: "string" },
        },
        required: ["item_id", "item_name", "type", "qty", "note"],
        additionalProperties: false,
      },
    },
    unclear: { type: "string" },
  },
  required: ["movements", "unclear"],
  additionalProperties: false,
};

const PHOTO_SCHEMA = {
  type: "object",
  properties: {
    supplier: { type: "string" },
    reference: { type: "string" },
    document_date: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          qty: { type: "integer" },
          unit_price: { type: "number" },
          item_id: { type: "string" },
        },
        required: ["description", "qty", "unit_price", "item_id"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["supplier", "reference", "document_date", "lines", "notes"],
  additionalProperties: false,
};

// ── Features ─────────────────────────────────────────────────────────

/** Prioritised actions + insights for the whole inventory. */
export async function analyzeInventory() {
  const state = getState();
  const forecasts = getForecasts();
  if (!isLive()) return { result: await demo.demoAnalysis(state, forecasts), demo: true };

  const snapshot = buildSnapshot(state, forecasts, getLang());
  const system = `You are the inventory assistant built into ${CONFIG.appName}. Today is ${snapshot.today}. Write all text in ${language()}.\n\n${inventoryContext(snapshot)}`;
  const { data, model } = await structured("analysis", { system, content: ANALYSIS_PROMPT, schema: ANALYSIS_SCHEMA });
  return { result: data, demo: false, model };
}

/** "I took 3 headphones and 2 cables" → proposed movements for the user to confirm. */
export async function parseMovementText(text) {
  const { items } = getState();
  if (!isLive()) return { ...(await demo.demoParse(text, items)), demo: true };

  const system = `You turn short notes about stock into movements for the inventory app ${CONFIG.appName}. Today is ${isoDate(new Date())}. Write any human-readable text in ${language()}.

Inventory (JSON): ${catalogOf(items)}

Rules:
- type "out" when units were taken, used, sold, sent, handed out, broken or lost; "in" when they were received, bought, returned or restocked.
- Match each product to the inventory by meaning (plurals, synonyms, abbreviations, other languages) and put its id in item_id, and its inventory name in item_name. If it isn't in the inventory, set item_id to "" and item_name to a clean product name.
- qty: a whole number above 0 ("a couple" = 2, "a box of 12" = 12).
- note: destination, person or reason if mentioned (a few words), otherwise "".
- unclear: if part of the message can't be read as a stock movement, explain briefly; otherwise "".`;
  const { data } = await structured("parse", { system, content: `Note:\n"""${text}"""`, schema: PARSE_SCHEMA });
  return { movements: data.movements, unclear: data.unclear, demo: false };
}

/** Photo of a delivery note / invoice → lines to receive into stock. */
export async function readDeliveryNote({ base64, mediaType }) {
  const { items } = getState();
  if (!isLive()) return { ...(await demo.demoDeliveryNote(items)), demo: true };

  const system = `You read photos of delivery notes, invoices and receipts for the inventory app ${CONFIG.appName}. Today is ${isoDate(new Date())}. Write any human-readable text in ${language()}.

Inventory (JSON): ${catalogOf(items)}

Extract every product line that was received:
- description: as written on the document.
- qty: whole number of units received. If the document counts packs but the matching inventory item counts units (or the other way round), convert when the pack size is stated.
- unit_price: price per unit before tax, or 0 if not shown.
- item_id: the id of the matching inventory item, or "" for a product that isn't in the inventory.
- supplier, reference (document number) and document_date (YYYY-MM-DD) from the header; "" when missing.
- notes: "" unless something needs the user's attention (unreadable lines, not a delivery document, totals that don't add up).`;
  const content = [
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    { type: "text", text: "Extract the lines of this document." },
  ];
  const { data } = await structured("photo", { system, content, schema: PHOTO_SCHEMA });
  return { ...data, demo: false };
}

/** Streaming chat about the inventory. history: [{ role, content }] ending with the user turn. */
export async function askChat(history, onText, { signal } = {}) {
  const state = getState();
  const forecasts = getForecasts();
  if (!isLive()) {
    const answer = demo.demoChat(history.at(-1).content, state, forecasts);
    await wait(450);
    for (const piece of answer.match(/\S+\s*/g) ?? [answer]) {
      if (signal?.aborted) return { demo: true };
      onText(piece);
      await wait(16);
    }
    return { demo: true };
  }

  const snapshot = buildSnapshot(state, forecasts, getLang());
  const system = `You are the inventory assistant built into ${CONFIG.appName}, answering in a small chat panel. Today is ${snapshot.today}.

${inventoryContext(snapshot)}

How to answer:
- Use only the data above. If the answer isn't in it, say so.
- Keep it short: about 120 words at most, unless the user asks for a draft or a full list. Plain sentences or a short bullet list; no tables or headings.
- Purchase-order drafts: address them to the item's supplier, group items from the same supplier, use suggested_order_qty unless the user gives a quantity, and ask for delivery before the stockout date. Make them ready to copy and send.
- Reply in the language the user writes in (default: ${language()}).`;

  const { Anthropic, client } = await getClient();
  try {
    const stream = client.beta.messages.stream({ ...requestParams("chat"), system, messages: history }, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new AIError("refusal");
    return { demo: false, model: final.model };
  } catch (err) {
    throw toAIError(err, Anthropic);
  }
}

/** Tiny request to check the key and model. Returns the model that answered. */
export async function testConnection() {
  const { Anthropic, client } = await getClient();
  try {
    const message = await client.beta.messages.create({
      ...requestParams("parse"),
      max_tokens: 1024,
      messages: [{ role: "user", content: "Reply with just: OK" }],
    });
    textOf(message);
    return message.model;
  } catch (err) {
    throw toAIError(err, Anthropic);
  }
}
