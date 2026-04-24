import { getToken, getCsrfToken } from "../auth";
import { debugToast } from "../debug";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

// --- Circuit Breaker ---

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  /** Listeners notified on state change */
  listeners: Set<(state: CircuitState) => void>;
}

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 30_000;

const circuit: CircuitBreaker = {
  state: "closed",
  failures: 0,
  lastFailureAt: 0,
  listeners: new Set(),
};

function setCircuitState(next: CircuitState) {
  if (circuit.state === next) return;
  circuit.state = next;
  circuit.listeners.forEach(fn => fn(next));
}

function recordSuccess() {
  circuit.failures = 0;
  setCircuitState("closed");
}

function recordFailure() {
  circuit.failures++;
  circuit.lastFailureAt = Date.now();
  if (circuit.failures >= FAILURE_THRESHOLD) {
    setCircuitState("open");
  }
}

function isCircuitOpen(): boolean {
  if (circuit.state === "closed") return false;
  if (circuit.state === "open") {
    // Check if reset timeout has elapsed → move to half_open
    if (Date.now() - circuit.lastFailureAt >= RESET_TIMEOUT_MS) {
      setCircuitState("half_open");
      return false; // allow the probe request through
    }
    return true;
  }
  // half_open — allow one probe request
  return false;
}

/** Subscribe to circuit breaker state changes */
export function onCircuitStateChange(fn: (state: CircuitState) => void): () => void {
  circuit.listeners.add(fn);
  return () => circuit.listeners.delete(fn);
}

/** Current circuit breaker state */
export function getCircuitState(): CircuitState {
  return circuit.state;
}

// --- Retry with exponential backoff ---

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function shouldRetry(status: number | null): boolean {
  if (status === null) return true; // network error
  return status >= 500; // only retry 5xx, not 4xx
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- apiFetch ---

export async function apiFetch<T>(path: string, options?: FetchOptions): Promise<T> {
  if (isCircuitOpen()) {
    throw new Error("Service temporarily unavailable (circuit open)");
  }

  const token = getToken();
  const csrfToken = getCsrfToken();
  const url = `${API_BASE}${path}`;
  const method = options?.method || "GET";
  const bodyStr = options?.body ? JSON.stringify(options.body) : undefined;
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    let status: number | null = null;

    try {
      const res = await fetch(url, {
        method,
        // Fase J.1 — credentials: "include" sender HttpOnly-auth-cookie.
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // Fase J.1 — CSRF-header for state-changing requests.
          ...(csrfToken && isStateChanging ? { "X-CSRF-Token": csrfToken } : {}),
          ...options?.headers,
        },
        body: bodyStr,
      });

      status = res.status;

      if (!res.ok) {
        const errBody = await res.text();
        debugToast(method, path, bodyStr, undefined, `${res.status} ${errBody}`);

        if (res.status === 401) {
          // Auth errors are not retriable and do not count as circuit failures
          throw new Error("Unauthenticated");
        }

        // CSRF-retry: on a 403 that mentions CSRF, refresh the token once
        // and retry. Previously this path hit shouldRetry(403)==false and
        // threw — but the frontend also had no submit-lock, so users
        // retried by hand and the server saw N duplicates with the same
        // stale token. Cap at one refresh attempt per request to prevent
        // infinite loops if the refresh endpoint itself rejects.
        const lowerBody = (errBody || "").toLowerCase();
        if (
          res.status === 403
          && isStateChanging
          && (lowerBody.includes("csrf") || lowerBody.includes("x-csrf-token"))
          && attempt === 0
        ) {
          try {
            // Hit a short endpoint that sets a fresh CSRF cookie. Direct
            // fetch to avoid apiFetch recursion.
            await fetch(`${API_BASE}/gateway/csrf-token`, {
              method: "GET",
              credentials: "include",
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            continue; // retry immediately with the new cookie value
          } catch {
            // fall through to normal error handling
          }
        }

        const err = new Error(errBody || `API error ${res.status}`);

        if (!shouldRetry(status)) {
          // 4xx — fail fast, don't count against circuit
          throw err;
        }

        lastError = err;
        recordFailure();
        continue; // retry
      }

      // Success
      recordSuccess();

      const text = await res.text();
      if (!text || text.length === 0) return {} as T;

      let data: T;
      try {
        data = JSON.parse(text);
      } catch {
        return {} as T;
      }

      debugToast(method, path, bodyStr, JSON.stringify(data).substring(0, 200));
      return data;

    } catch (err) {
      if (err instanceof Error && err.message === "Unauthenticated") {
        throw err; // Don't retry auth errors
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      if (!shouldRetry(status)) {
        throw lastError;
      }

      recordFailure();

      // If circuit just opened, stop retrying immediately
      if (circuit.state === "open") break;
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}
