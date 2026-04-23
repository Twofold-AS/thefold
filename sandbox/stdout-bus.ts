import { EventEmitter } from "events";

// Fase K.2 — In-process stdout event-bus for sandbox-validation live-streaming.
// Per-sandbox EventEmitter + ring-buffer (siste 500 linjer) for sent-join
// replay-støtte når frontend kobler på midt i kjøring.

export type StdoutEventKind =
  | "stdout.line"
  | "stdout.phase_start"
  | "stdout.phase_end"
  | "stdout.error";

export interface StdoutLineEvent {
  kind: "stdout.line";
  ts: number;
  phaseIndex: number;
  phaseName: string;
  stream: "stdout" | "stderr";
  line: string;
}

export interface StdoutPhaseStartEvent {
  kind: "stdout.phase_start";
  ts: number;
  phaseIndex: number;
  phaseName: string;
}

export interface StdoutPhaseEndEvent {
  kind: "stdout.phase_end";
  ts: number;
  phaseIndex: number;
  phaseName: string;
  success: boolean;
  durationMs: number;
  metrics?: Record<string, number>;
}

export interface StdoutErrorEvent {
  kind: "stdout.error";
  ts: number;
  phaseIndex?: number;
  phaseName?: string;
  message: string;
}

export type StdoutEvent =
  | StdoutLineEvent
  | StdoutPhaseStartEvent
  | StdoutPhaseEndEvent
  | StdoutErrorEvent;

const BUFFER_SIZE = 500;

class SandboxStdoutBus {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, StdoutEvent[]>();
  /** Sandbox-eier for auth-verifisering i SSE-endpoint */
  private owners = new Map<string, string>();

  getEmitter(sandboxId: string): EventEmitter {
    let em = this.emitters.get(sandboxId);
    if (!em) {
      em = new EventEmitter();
      em.setMaxListeners(20);
      this.emitters.set(sandboxId, em);
    }
    return em;
  }

  getBuffer(sandboxId: string): StdoutEvent[] {
    return this.buffers.get(sandboxId) ?? [];
  }

  setOwner(sandboxId: string, ownerEmail: string): void {
    this.owners.set(sandboxId, ownerEmail);
  }

  getOwner(sandboxId: string): string | null {
    return this.owners.get(sandboxId) ?? null;
  }

  emit(sandboxId: string, event: StdoutEvent): void {
    let buf = this.buffers.get(sandboxId);
    if (!buf) { buf = []; this.buffers.set(sandboxId, buf); }
    buf.push(event);
    if (buf.length > BUFFER_SIZE) buf.shift();
    this.getEmitter(sandboxId).emit("event", event);
  }

  subscribe(sandboxId: string, handler: (event: StdoutEvent) => void): () => void {
    const em = this.getEmitter(sandboxId);
    em.on("event", handler);
    return () => em.off("event", handler);
  }

  cleanup(sandboxId: string): void {
    this.emitters.get(sandboxId)?.removeAllListeners();
    this.emitters.delete(sandboxId);
    this.buffers.delete(sandboxId);
    this.owners.delete(sandboxId);
  }
}

export const sandboxStdoutBus = new SandboxStdoutBus();

/** SSE-format helper. */
export function formatStdoutSSE(event: StdoutEvent): string {
  const json = JSON.stringify(event);
  return `event: ${event.kind}\ndata: ${json}\n\n`;
}
