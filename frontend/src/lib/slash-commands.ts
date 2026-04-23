// Fase I.8 — Command-registry for slash-commands i chat-composer.
// Plain-text dropdown under chatbox når meldingen starter med "/".

export interface SlashCommand {
  id: string;
  /** Kommando uten skråstrek, f.eks. "plan" for "/plan" */
  trigger: string;
  description: string;
  /** Scope hvor kommandoen vises: cowork, designer eller begge. */
  scope: "cowork" | "designer" | "both";
  /** Tekst som settes inn i chatboksen når kommandoen velges. */
  template: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "plan",
    trigger: "plan",
    description: "Be agenten lage en plan før eksekvering",
    scope: "both",
    template: "/plan ",
  },
  {
    id: "review",
    trigger: "review",
    description: "Sjekk koden i nåværende branch",
    scope: "cowork",
    template: "/review ",
  },
  {
    id: "test",
    trigger: "test",
    description: "Kjør tester for nåværende kontekst",
    scope: "cowork",
    template: "/test ",
  },
  {
    id: "explain",
    trigger: "explain",
    description: "Forklar en fil eller konsept",
    scope: "both",
    template: "/explain ",
  },
  {
    id: "import",
    trigger: "import",
    description: "Importer design fra Framer/Figma-eksport",
    scope: "designer",
    template: "/import ",
  },
  {
    id: "component",
    trigger: "component",
    description: "Registrer eller finn komponent",
    scope: "both",
    template: "/component ",
  },
  {
    id: "heal",
    trigger: "heal",
    description: "Kjør healing på en komponent",
    scope: "both",
    template: "/heal ",
  },
  {
    id: "sync",
    trigger: "sync",
    description: "Synk med Framer/Figma/GitHub",
    scope: "both",
    template: "/sync ",
  },
  {
    id: "new",
    trigger: "new",
    description: "Opprett nytt prosjekt",
    scope: "both",
    template: "/new ",
  },
];

export function matchSlashCommands(input: string, scope: "cowork" | "designer"): SlashCommand[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) return [];
  const query = trimmed.slice(1).split(/\s/)[0].toLowerCase();
  return SLASH_COMMANDS
    .filter((c) => c.scope === "both" || c.scope === scope)
    .filter((c) => (query === "" ? true : c.trigger.startsWith(query)));
}
