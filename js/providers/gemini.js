// Gemini (Google) adapter — official Google Gen AI SDK, Interactions API.
import { CONFIG } from "../config.js";
import { AIError, fromStatus, sdkLoader } from "../ai-errors.js";
import { getApiKey } from "../store.js";

const cfg = CONFIG.ai.providers.gemini;
const loadSdk = sdkLoader(cfg.sdkUrl, (mod) => mod.GoogleGenAI);

async function getClient() {
  const GoogleGenAI = await loadSdk();
  // The key never leaves this browser except to go to Google's Gemini API.
  return new GoogleGenAI({ apiKey: getApiKey("gemini") });
}

// store: false → stateless requests; we send the history ourselves.
const baseParams = (model, effort) => ({ model, store: false, ...(effort ? { generation_config: { thinking_level: effort } } : {}) });

/** The SDK keeps Google's JSON error in `body`: [{ error: { message, details: [{ reason }] } }] */
function googleError(err) {
  try {
    const parsed = JSON.parse(err.body);
    const error = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    return { message: error?.message, reason: error?.details?.find((d) => d.reason)?.reason };
  } catch {
    return {};
  }
}

function toAIError(err) {
  if (err instanceof AIError) return err;
  if (err?.name === "AbortError") return new AIError("aborted");
  if (typeof err?.status === "number") {
    const { message, reason } = googleError(err);
    // Google answers an invalid key with 400 + reason API_KEY_INVALID (not 401).
    if (reason === "API_KEY_INVALID") return new AIError("auth");
    return fromStatus(err.status, message ?? err.message);
  }
  if (err instanceof TypeError) return new AIError("network");
  return new AIError("generic", err?.message ?? String(err));
}

function textOf(interaction) {
  if (interaction.status === "incomplete") throw new AIError("truncated");
  if (interaction.status === "failed") throw new AIError("generic", interaction.error?.message);
  return interaction.output_text ?? "";
}

/** Gemini accepts a subset of JSON Schema: drop the keys it doesn't need. */
function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "additionalProperties").map(([k, v]) => [k, geminiSchema(v)]));
}

const turn = ({ role, content }) => ({ type: role === "assistant" ? "model_output" : "user_input", content: [{ type: "text", text: content }] });

/** One request whose answer must match a JSON schema. */
export async function structured({ model, effort, system, text, image, schema }) {
  const content = [{ type: "text", text }];
  if (image) content.unshift({ type: "image", data: image.base64, mime_type: image.mediaType });
  try {
    const ai = await getClient();
    const interaction = await ai.interactions.create({
      ...baseParams(model, effort),
      system_instruction: system,
      input: [{ type: "user_input", content }],
      response_format: { type: "text", mime_type: "application/json", schema: geminiSchema(schema) },
    });
    return { json: textOf(interaction), model };
  } catch (err) {
    throw toAIError(err);
  }
}

/** Streaming chat. history: [{ role: "user"|"assistant", content: string }] */
export async function stream({ model, effort, system, history, onText, signal }) {
  try {
    const ai = await getClient();
    const events = await ai.interactions.create({ ...baseParams(model, effort), system_instruction: system, input: history.map(turn), stream: true });
    for await (const event of events) {
      if (signal?.aborted) throw new AIError("aborted");
      if (event.event_type === "step.delta" && event.delta?.type === "text") onText(event.delta.text);
      else if (event.event_type === "error") throw new AIError("generic", event.error?.message);
    }
    return { model };
  } catch (err) {
    throw toAIError(err);
  }
}

export async function test({ model }) {
  try {
    const ai = await getClient();
    textOf(await ai.interactions.create({ ...baseParams(model, "low"), input: "Reply with just: OK" }));
    return model;
  } catch (err) {
    throw toAIError(err);
  }
}
