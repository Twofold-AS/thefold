import { spawn, ChildProcess } from "child_process";
import log from "encore.dev/log";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private buffer = "";
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private serverName: string;
  private tools: MCPTool[] = [];

  constructor(
    private command: string,
    private args: string[],
    private envVars: Record<string, string>,
    serverName: string,
    private timeoutMs = 30000,
  ) {
    this.serverName = serverName;
  }

  /**
   * Start MCP server subprocess og kjør initialize handshake
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.kill();
        reject(new Error(`MCP server ${this.serverName} failed to start within ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      try {
        this.process = spawn(this.command, this.args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...this.envVars },
        });

        this.process.stdout?.on("data", (chunk: Buffer) => {
          this.buffer += chunk.toString();
          this.processBuffer();
        });

        this.process.stderr?.on("data", (chunk: Buffer) => {
          log.warn("MCP server stderr", { server: this.serverName, msg: chunk.toString().trim() });
        });

        this.process.on("error", (err) => {
          clearTimeout(timeout);
          reject(new Error(`MCP server ${this.serverName} spawn error: ${err.message}`));
        });

        this.process.on("exit", (code) => {
          log.info("MCP server exited", { server: this.serverName, code });
          this.cleanup();
        });

        // MCP Initialize handshake
        this.sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "thefold-agent", version: "1.0.0" },
        }).then((_initResult) => {
          // Send initialized notification
          this.sendNotification("notifications/initialized", {});

          // List available tools
          return this.sendRequest("tools/list", {});
        }).then((toolsResult) => {
          const result = toolsResult.result as { tools?: MCPTool[] } | undefined;
          this.tools = result?.tools ?? [];
          clearTimeout(timeout);
          log.info("MCP server started", {
            server: this.serverName,
            toolCount: this.tools.length,
            tools: this.tools.map(t => t.name),
          });
          resolve();
        }).catch((err) => {
          clearTimeout(timeout);
          this.kill();
          reject(err);
        });

      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Kall et MCP tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.process) {
      throw new Error(`MCP server ${this.serverName} is not running`);
    }

    const response = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    });

    if (response.error) {
      return {
        content: [{ type: "text", text: `MCP Error: ${response.error.message}` }],
        isError: true,
      };
    }

    return response.result as MCPToolCallResult;
  }

  /**
   * Hent tilgjengelige tools
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Avslutt MCP server
   */
  kill(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      // Force kill etter 5 sekunder
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this.cleanup();
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  // --- Private ---

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.write(request);
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    // Notifications har ingen id
    const msg = { jsonrpc: "2.0" as const, method, params };
    this.write(msg);
  }

  private write(msg: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      throw new Error(`MCP server ${this.serverName} stdin not writable`);
    }
    const json = JSON.stringify(msg);
    this.process.stdin.write(json + "\n");
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg);
        }
        // Ignorer notifications og andre meldinger uten matchende id
      } catch {
        // Ignorer ugyldige JSON-linjer (kan være log-output)
      }
    }
  }

  private cleanup(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MCP server connection closed"));
      this.pendingRequests.delete(id);
    }
    this.process = null;
    this.tools = [];
  }
}
