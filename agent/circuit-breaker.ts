/**
 * Circuit Breaker pattern (OWASP ASI08) — prevents cascading failures
 * when downstream services are unhealthy.
 *
 * States:
 *   closed    → normal operation, calls pass through
 *   open      → service considered down, calls rejected immediately
 *   half_open → after reset timeout, one call allowed through to test recovery
 */

type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;

  constructor(
    private name: string,
    private threshold: number = 5,
    private resetTimeoutMs: number = 60_000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt > this.resetTimeoutMs) {
        this.state = "half_open";
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN — service unavailable`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset() {
    this.failures = 0;
    this.state = "closed";
    this.openedAt = 0;
  }
}

// Pre-configured breakers for critical services
export const aiBreaker = new CircuitBreaker("ai", 5, 60_000);
export const githubBreaker = new CircuitBreaker("github", 5, 60_000);
export const sandboxBreaker = new CircuitBreaker("sandbox", 3, 30_000);
