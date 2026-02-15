import { describe, it, expect, beforeEach } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", 3, 100); // low threshold + timeout for testing
  });

  it("should start in closed state", () => {
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailures()).toBe(0);
  });

  it("should pass through successful calls", async () => {
    const result = await breaker.call(async () => "ok");
    expect(result).toBe("ok");
    expect(breaker.getState()).toBe("closed");
  });

  it("should count failures but stay closed below threshold", async () => {
    const fail = async () => { throw new Error("fail"); };

    await expect(breaker.call(fail)).rejects.toThrow("fail");
    expect(breaker.getFailures()).toBe(1);
    expect(breaker.getState()).toBe("closed");

    await expect(breaker.call(fail)).rejects.toThrow("fail");
    expect(breaker.getFailures()).toBe(2);
    expect(breaker.getState()).toBe("closed");
  });

  it("should open after reaching failure threshold", async () => {
    const fail = async () => { throw new Error("fail"); };

    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow("fail");
    }

    expect(breaker.getState()).toBe("open");
    expect(breaker.getFailures()).toBe(3);
  });

  it("should reject calls immediately when open", async () => {
    const fail = async () => { throw new Error("fail"); };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow("fail");
    }

    // Next call should be rejected with circuit breaker error
    await expect(breaker.call(async () => "should not run"))
      .rejects.toThrow("Circuit breaker [test] is OPEN");
  });

  it("should transition to half_open after reset timeout", async () => {
    const fail = async () => { throw new Error("fail"); };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("open");

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next call should go through (half_open)
    const result = await breaker.call(async () => "recovered");
    expect(result).toBe("recovered");
    expect(breaker.getState()).toBe("closed");
  });

  it("should re-open if half_open call fails", async () => {
    const fail = async () => { throw new Error("fail"); };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow("fail");
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Half-open call fails → back to open
    await expect(breaker.call(fail)).rejects.toThrow("fail");
    // After threshold failures again it should be open
    // (failures count accumulated, so now at 4 >= 3)
    expect(breaker.getState()).toBe("open");
  });

  it("should reset failure count on success", async () => {
    const fail = async () => { throw new Error("fail"); };

    // 2 failures
    await expect(breaker.call(fail)).rejects.toThrow();
    await expect(breaker.call(fail)).rejects.toThrow();
    expect(breaker.getFailures()).toBe(2);

    // 1 success resets
    await breaker.call(async () => "ok");
    expect(breaker.getFailures()).toBe(0);
    expect(breaker.getState()).toBe("closed");
  });

  it("should support manual reset", async () => {
    const fail = async () => { throw new Error("fail"); };

    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailures()).toBe(0);

    // Should work again
    const result = await breaker.call(async () => "reset works");
    expect(result).toBe("reset works");
  });
});
