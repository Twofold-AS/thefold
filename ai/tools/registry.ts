// ai/tools/registry.ts
// ToolRegistry — holder alle verktøy, filtrerer på surface/plan,
// formaterer for ulike providere, og eksekverer.

import type { Tool, ToolContext, ToolResult, ToolSurface } from "./types";
import { zodToAnthropicSchema, zodToOpenAISchema } from "./format";

// Use `Tool<any>` for storage because `Tool<TInput>` is contravariant in
// TInput (via `handler`), so `Tool<SpecificShape>` is not assignable to
// `Tool<unknown>`. Zod validation at runtime still guarantees type-safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any>;

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();
  private mcpTools = new Map<string, AnyTool>();
  private callCounts = new Map<string, Map<string, number>>(); // sessionId → toolName → count

  constructor(initial: AnyTool[] = []) {
    for (const t of initial) {
      this.register(t);
    }
  }

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMcpTools(adapters: AnyTool[]): void {
    for (const t of adapters) {
      this.mcpTools.set(t.name, t);
    }
  }

  unregisterMcpTools(): void {
    this.mcpTools.clear();
  }

  /** Hent alle verktøy uten filtrering (debug/admin) */
  all(): AnyTool[] {
    return [...this.tools.values(), ...this.mcpTools.values()];
  }

  /** Hent et spesifikt verktøy ved navn (undefined hvis ikke funnet) */
  get(name: string): AnyTool | undefined {
    return this.tools.get(name) ?? this.mcpTools.get(name);
  }

  /** Filtrer etter overflate (chat eller agent) */
  forSurface(surface: ToolSurface): AnyTool[] {
    return this.all().filter((t) => (t.surfaces ?? ["chat", "agent"]).includes(surface));
  }

  /** Filtrer med plan-aware-regler */
  filtered(opts: { surface: ToolSurface; activePlan?: boolean }): AnyTool[] {
    return this.forSurface(opts.surface).filter((t) => {
      if (opts.activePlan && t.forbiddenWithActivePlan) return false;
      if (!opts.activePlan && t.requiresActivePlan) return false;
      return true;
    });
  }

  /** Konverter til Anthropic-tool-format */
  toAnthropicFormat(tools: AnyTool[]): Array<{
    name: string;
    description: string;
    input_schema: object;
  }> {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: zodToAnthropicSchema(t.inputSchema),
    }));
  }

  /** Konverter til OpenAI-tool-format */
  toOpenAIFormat(tools: AnyTool[]): Array<{
    type: "function";
    function: { name: string; description: string; parameters: object };
  }> {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToOpenAISchema(t.inputSchema),
      },
    }));
  }

  /** Eksekver et verktøy med Zod-validering og rate-limit */
  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name) ?? this.mcpTools.get(name);
    if (!tool) {
      return { success: false, message: `Unknown tool: ${name}` };
    }

    // Rate-limit
    if (tool.maxCallsPerSession && ctx.conversationId) {
      const sessionCalls = this.callCounts.get(ctx.conversationId) ?? new Map<string, number>();
      const current = sessionCalls.get(name) ?? 0;
      if (current >= tool.maxCallsPerSession) {
        return {
          success: false,
          message: `Rate limit reached for ${name} (${tool.maxCallsPerSession} per session). Try again later.`,
        };
      }
      sessionCalls.set(name, current + 1);
      this.callCounts.set(ctx.conversationId, sessionCalls);
    }

    // Zod-validering
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        message: `Invalid input: ${parsed.error.message}`,
      };
    }

    // Eksekver
    try {
      return await tool.handler(parsed.data as never, ctx);
    } catch (e) {
      ctx.log.error("tool execution failed", {
        tool: name,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        success: false,
        message: `Tool failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /** For testing — reset rate-limit-counters */
  resetRateLimits(): void {
    this.callCounts.clear();
  }
}
