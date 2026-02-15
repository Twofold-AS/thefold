/** Detect if a user message is a large project request vs a simple task */
export function detectProjectRequest(message: string): boolean {
  // Explicit prefix
  if (message.toLowerCase().startsWith("prosjekt:")) return true;

  const words = message.split(/\s+/);

  // Short messages are never project requests
  if (words.length < 30) return false;

  // Count feature indicators
  const featureWords = ["og", "med", "samt", "pluss", "inkludert", "and", "with", "plus", "including"];
  const buildWords = ["bygg", "lag", "opprett", "implementer", "skap", "build", "create", "implement", "develop"];
  const systemWords = ["system", "tjeneste", "service", "modul", "module", "komponent", "component", "side", "page", "api", "database", "frontend", "backend"];

  const lowerMsg = message.toLowerCase();

  const hasBuildWord = buildWords.some((w) => lowerMsg.includes(w));
  const featureCount = featureWords.filter((w) => lowerMsg.includes(` ${w} `)).length;
  const systemCount = systemWords.filter((w) => lowerMsg.includes(w)).length;

  // Long message (>100 words) with build words and multiple systems/features
  if (words.length > 100 && hasBuildWord && systemCount >= 2) return true;

  // Medium message with many systems mentioned
  if (words.length > 50 && hasBuildWord && systemCount >= 3) return true;

  // Message with multiple feature connectors and build intent
  if (hasBuildWord && featureCount >= 2 && systemCount >= 2) return true;

  return false;
}
