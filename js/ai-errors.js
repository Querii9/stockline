// One error type for every AI provider, so the UI can show the same friendly messages.
export class AIError extends Error {
  constructor(code, detail = "") {
    super(detail || code);
    this.code = code; // auth | permission | rate | badRequest | server | network | aborted | refusal | truncated | format | sdk | generic
    this.detail = detail;
  }
}

/** HTTP status → error code (used when an SDK only gives us a status number). */
export function fromStatus(status, message = "") {
  if (status === 401) return new AIError("auth");
  if (status === 403) return new AIError("permission");
  if (status === 429) return new AIError("rate");
  if (status === 400 || status === 404 || status === 422) return new AIError("badRequest", message);
  if (status >= 500) return new AIError("server");
  return new AIError("generic", message);
}

/**
 * Maps errors from SDKs that share the same typed error classes
 * (the Anthropic and OpenAI JavaScript SDKs both do).
 */
export function fromTypedSdkError(err, SDK) {
  if (err instanceof AIError) return err;
  const message = err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? String(err);
  if (SDK) {
    if (err instanceof SDK.AuthenticationError) return new AIError("auth");
    if (err instanceof SDK.PermissionDeniedError) return new AIError("permission");
    if (err instanceof SDK.RateLimitError) return new AIError("rate");
    if (err instanceof SDK.BadRequestError || err instanceof SDK.NotFoundError) return new AIError("badRequest", message);
    if (err instanceof SDK.InternalServerError) return new AIError("server");
    if (err instanceof SDK.APIUserAbortError) return new AIError("aborted");
    if (err instanceof SDK.APIConnectionError) return new AIError("network");
    if (err instanceof SDK.APIError) return new AIError("generic", message);
  }
  return new AIError("generic", message);
}

/** Loads an SDK from the CDN once; `pick` chooses the export to use. */
export function sdkLoader(url, pick) {
  let promise = null;
  return () => {
    promise ??= import(url).then(pick).catch((err) => {
      promise = null;
      throw new AIError("sdk", err.message);
    });
    return promise;
  };
}
