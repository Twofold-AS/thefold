/**
 * Input sanitization for AI calls — OWASP A03:2025 Injection protection.
 * Strips potentially dangerous content from user input before passing to AI endpoints.
 */

const DEFAULT_MAX_LENGTH = 50_000;

interface SanitizeOptions {
  maxLength?: number;
}

/**
 * Sanitize user input before sending to AI endpoints.
 * - Trims whitespace
 * - Removes null bytes (\x00)
 * - Removes control characters (keeps \n, \t, \r)
 * - Enforces max length
 */
export function sanitize(input: string, options?: SanitizeOptions): string {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;

  let s = input.trim();

  // Remove null bytes
  s = s.replace(/\x00/g, "");

  // Remove control characters except \n (0x0A), \t (0x09), \r (0x0D)
  // Control chars: \x01-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
  s = s.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Enforce max length
  if (s.length > maxLength) {
    s = s.substring(0, maxLength);
  }

  return s;
}
