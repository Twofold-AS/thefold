// Vision helpers — shared by any code path that needs to attach an image to
// an AI request. The vision flag itself is read from MODEL_CAPABILITIES (see
// ./router.ts getCapabilities) — NOT from provider name. Different providers
// with vision support use different wire formats for image blocks; this
// module centralises the format-per-provider mapping so callers don't need
// to branch on provider strings.

/** Image block shape accepted by the target provider's chat API. */
export type ImageBlock =
  | { type: "image"; source: { type: "url"; url: string } }       // Anthropic native
  | { type: "image_url"; image_url: { url: string } }             // OpenAI-compat, MiniMax, Moonshot, OpenRouter
  | { inline_data: { mime_type: string; data: string } }          // Google Gemini (base64)
  ;

/**
 * Return the correct image-block shape for the given provider slug.
 * Callers that already know the model and its provider (from
 * getCapabilities) pass `provider` directly. For providers we don't have
 * native support for yet, returns null so the caller can fall back to
 * text-only (e.g. "[Screenshot: <url>]" inline).
 */
export function formatImageBlock(provider: string, url: string): ImageBlock | null {
  switch (provider) {
    case "anthropic":
      return { type: "image", source: { type: "url", url } };
    case "openai":
    case "openai-compat":
    case "minimax":
    case "moonshot":
    case "openrouter":
    case "fireworks":
      return { type: "image_url", image_url: { url } };
    case "google":
      // Gemini prefers base64-inlined bytes; passing URL won't work for
      // `inline_data`. Callers who need Gemini vision should download the
      // bytes first. Returning null so the caller falls back to text.
      return null;
    default:
      return null;
  }
}

/** Build a message-content array with text + optional image block. */
export function buildVisionContent(
  text: string,
  provider: string,
  imageUrl?: string | null,
): Array<{ type: "text"; text: string } | ImageBlock> {
  const parts: Array<{ type: "text"; text: string } | ImageBlock> = [
    { type: "text", text },
  ];
  if (imageUrl) {
    const block = formatImageBlock(provider, imageUrl);
    if (block) parts.push(block);
  }
  return parts;
}
