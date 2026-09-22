// Claude (Anthropic) adapter — official SDK, Messages API.
import { CONFIG } from "../config.js";
import { AIError, fromTypedSdkError, sdkLoader } from "../ai-errors.js";
import { getApiKey } from "../store.js";

const cfg = CONFIG.ai.providers.anthropic;
const loadSdk = sdkLoader(cfg.sdkUrl, (mod) => mod.default ?? mod.Anthropic);
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);
const supportsEffort = (model) => !/haiku|sonnet-4-5|opus-4-1|claude-3/.test(model);

async function getClient() {
  const Anthropic = await loadSdk();
  // The key never leaves this browser except to go to api.anthropic.com.
  return { Anthropic, client: new Anthropic({ apiKey: getApiKey("anthropic"), dangerouslyAllowBrowser: true }) };
}

function baseParams(model, effort) {
  const params = { model, max_tokens: 16000 };
  if (effort && supportsEffort(model)) params.output_config = { effort };
  if (cfg.refusalFallback && FALLBACK_MODELS.has(model)) {
    // If the model declines, the API re-runs the request on Anthropic's recommended fallback model.
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
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
export async function structured({ model, effort, system, text, image, schema }) {
  const { Anthropic, client } = await getClient();
  const content = [{ type: "text", text }];
  if (image) content.unshift({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
  const params = baseParams(model, effort);
  params.output_config = { ...params.output_config, format: { type: "json_schema", schema } };
  try {
    const message = await client.beta.messages.create({ ...params, system, messages: [{ role: "user", content }] });
    return { json: textOf(message), model: message.model };
  } catch (err) {
    throw fromTypedSdkError(err, Anthropic);
  }
}

/** Streaming chat. history: [{ role: "user"|"assistant", content: string }] */
export async function stream({ model, effort, system, history, onText, signal }) {
  const { Anthropic, client } = await getClient();
  try {
    const stream = client.beta.messages.stream({ ...baseParams(model, effort), system, messages: history }, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new AIError("refusal");
    return { model: final.model };
  } catch (err) {
    throw fromTypedSdkError(err, Anthropic);
  }
}

export async function test({ model }) {
  const { Anthropic, client } = await getClient();
  try {
    const message = await client.beta.messages.create({
      ...baseParams(model, "low"),
      max_tokens: 1024,
      messages: [{ role: "user", content: "Reply with just: OK" }],
    });
    textOf(message);
    return message.model;
  } catch (err) {
    throw fromTypedSdkError(err, Anthropic);
  }
}
