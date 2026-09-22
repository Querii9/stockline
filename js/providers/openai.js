// OpenAI adapter — official SDK, Responses API.
import { CONFIG } from "../config.js";
import { AIError, fromTypedSdkError, sdkLoader } from "../ai-errors.js";
import { getApiKey } from "../store.js";

const cfg = CONFIG.ai.providers.openai;
const loadSdk = sdkLoader(cfg.sdkUrl, (mod) => mod.default ?? mod.OpenAI);

async function getClient() {
  const OpenAI = await loadSdk();
  // The key never leaves this browser except to go to api.openai.com.
  return { OpenAI, client: new OpenAI({ apiKey: getApiKey("openai"), dangerouslyAllowBrowser: true, maxRetries: 1 }) };
}

// OpenAI's error responses (e.g. 401 for a wrong key) don't carry CORS headers, so the browser
// can't read them and the SDK only sees a connection error. Say so instead of blaming the network.
function toAIError(err, OpenAI) {
  const error = fromTypedSdkError(err, OpenAI);
  return error.code === "network" ? new AIError("networkOrKey") : error;
}

// store: false → OpenAI doesn't keep the conversation for later retrieval.
const baseParams = (model, effort) => ({ model, store: false, max_output_tokens: 16000, ...(effort ? { reasoning: { effort } } : {}) });

function textOf(response) {
  const refused = response.output?.some((item) => item.content?.some((part) => part.type === "refusal"));
  if (refused) throw new AIError("refusal");
  if (response.status === "incomplete") throw new AIError("truncated");
  return response.output_text ?? "";
}

/** One request whose answer must match a JSON schema (structured outputs, strict mode). */
export async function structured({ model, effort, system, text, image, schema }) {
  const { OpenAI, client } = await getClient();
  const content = [{ type: "input_text", text }];
  if (image) content.unshift({ type: "input_image", image_url: `data:${image.mediaType};base64,${image.base64}` });
  try {
    const response = await client.responses.create({
      ...baseParams(model, effort),
      instructions: system,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "stockline_result", schema, strict: true } },
    });
    return { json: textOf(response), model: response.model };
  } catch (err) {
    throw toAIError(err, OpenAI);
  }
}

/** Streaming chat. history: [{ role: "user"|"assistant", content: string }] */
export async function stream({ model, effort, system, history, onText, signal }) {
  const { OpenAI, client } = await getClient();
  try {
    const events = await client.responses.create(
      { ...baseParams(model, effort), instructions: system, input: history, stream: true },
      { signal },
    );
    let final = null;
    for await (const event of events) {
      if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") onText(event.delta);
      else if (event.type === "response.completed" || event.type === "response.incomplete") final = event.response;
      else if (event.type === "response.failed") throw new AIError("generic", event.response?.error?.message);
      else if (event.type === "error") throw new AIError("generic", event.message);
    }
    return { model: final?.model ?? model };
  } catch (err) {
    throw toAIError(err, OpenAI);
  }
}

export async function test({ model }) {
  const { OpenAI, client } = await getClient();
  try {
    const response = await client.responses.create({ ...baseParams(model, "low"), max_output_tokens: 1024, input: "Reply with just: OK" });
    textOf(response);
    return response.model;
  } catch (err) {
    throw toAIError(err, OpenAI);
  }
}
