/**
 * Parse an unknown error from a sendMessage/chat API call and set a
 * human-readable Norwegian error string via the provided setter.
 */
export function parseAndSetChatError(
  e: unknown,
  setter: (msg: string) => void,
): void {
  const msg = e instanceof Error ? e.message : "Noe gikk galt";
  const lower = msg.toLowerCase();
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota") || lower.includes("brukt opp")) {
    setter("AI-credits er brukt opp. Sjekk billing hos leverandøren.");
  } else if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many")) {
    setter("For mange forespørsler — vent litt og prøv igjen.");
  } else if (lower.includes("api key") || lower.includes("api-nøkkel") || lower.includes("401") || lower.includes("ugyldig")) {
    setter("API-nøkkelen er ugyldig. Sjekk AI-innstillingene.");
  } else if (lower.includes("unavailable") || lower.includes("503") || lower.includes("utilgjengelig") || lower.includes("overloaded")) {
    setter("AI-tjenesten er midlertidig nede. Prøv igjen om litt.");
  } else if (lower.includes("context length") || lower.includes("too long")) {
    setter("Meldingen er for lang. Prøv en kortere melding.");
  } else {
    setter(msg);
  }
}
