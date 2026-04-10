#!/usr/bin/env node
/**
 * SSE Load Benchmark — D46
 *
 * Opens N concurrent EventSource-style HTTP connections to the agent SSE
 * stream endpoint and measures connection time, event latency, and reports
 * p50/p95/p99 statistics.
 *
 * Usage:
 *   npx tsx tests/load/sse-benchmark.ts [options]
 *
 * Options:
 *   --connections=<n>   Number of concurrent connections (default: 10)
 *   --duration=<s>      How long to run in seconds (default: 30)
 *   --url=<url>         Base URL (default: http://localhost:4000)
 *   --task-id=<id>      Task ID to subscribe to (default: benchmark-test)
 *   --token=<token>     Bearer token for auth (default: benchmark-token)
 *
 * Example:
 *   npx tsx tests/load/sse-benchmark.ts --connections=100 --duration=60
 */

import http from "http";
import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

function parseArg(name: string, defaultValue: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : defaultValue;
}

const CONNECTIONS = parseInt(parseArg("connections", "10"), 10);
const DURATION_S = parseInt(parseArg("duration", "30"), 10);
const BASE_URL = parseArg("url", "http://localhost:4000");
const TASK_ID = parseArg("task-id", "benchmark-test");
const TOKEN = parseArg("token", "benchmark-token");

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionResult {
  connectionMs: number;       // time from request start to first byte
  eventsReceived: number;     // total SSE events received
  eventLatencies: number[];   // ms between consecutive events (approximation)
  errors: string[];
  closed: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printStats(label: string, values: number[]) {
  if (values.length === 0) {
    console.log(`  ${label}: no data`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  console.log(
    `  ${label}: min=${sorted[0].toFixed(1)}ms  avg=${avg.toFixed(1)}ms  ` +
      `p50=${percentile(sorted, 50).toFixed(1)}ms  ` +
      `p95=${percentile(sorted, 95).toFixed(1)}ms  ` +
      `p99=${percentile(sorted, 99).toFixed(1)}ms  ` +
      `max=${sorted[sorted.length - 1].toFixed(1)}ms  n=${values.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single SSE connection
// ─────────────────────────────────────────────────────────────────────────────

async function runConnection(id: number): Promise<ConnectionResult> {
  const result: ConnectionResult = {
    connectionMs: 0,
    eventsReceived: 0,
    eventLatencies: [],
    errors: [],
    closed: false,
  };

  return new Promise((resolve) => {
    const startMs = Date.now();
    let firstByteMs = 0;
    let lastEventMs = Date.now();

    const url = new URL(`/agent/stream?taskId=${TASK_ID}-${id}`, BASE_URL);
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
      (res) => {
        firstByteMs = Date.now() - startMs;
        result.connectionMs = firstByteMs;

        res.setEncoding("utf8");

        res.on("data", (chunk: string) => {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              const now = Date.now();
              result.eventsReceived++;
              if (result.eventsReceived > 1) {
                result.eventLatencies.push(now - lastEventMs);
              }
              lastEventMs = now;
            }
          }
        });

        res.on("end", () => {
          result.closed = true;
          resolve(result);
        });

        res.on("error", (err: Error) => {
          result.errors.push(err.message);
          resolve(result);
        });
      },
    );

    req.on("error", (err) => {
      result.errors.push(err.message);
      result.connectionMs = Date.now() - startMs;
      resolve(result);
    });

    // Close connection after duration
    setTimeout(() => {
      req.destroy();
      result.closed = true;
      resolve(result);
    }, DURATION_S * 1000);

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║        SSE Load Benchmark — TheFold       ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`  Target:      ${BASE_URL}/agent/stream`);
  console.log(`  Connections: ${CONNECTIONS}`);
  console.log(`  Duration:    ${DURATION_S}s`);
  console.log(`  Task ID:     ${TASK_ID}-*`);
  console.log("");

  const runStart = Date.now();
  console.log(`Starting ${CONNECTIONS} concurrent connections…`);

  const promises = Array.from({ length: CONNECTIONS }, (_, i) => runConnection(i));
  const results = await Promise.allSettled(promises);

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  console.log(`\nAll connections closed after ${elapsed}s\n`);

  // Aggregate
  const successful = results
    .filter((r): r is PromiseFulfilledResult<ConnectionResult> => r.status === "fulfilled")
    .map((r) => r.value);

  const failed = results.filter((r) => r.status === "rejected").length;
  const withErrors = successful.filter((r) => r.errors.length > 0).length;
  const totalEvents = successful.reduce((s, r) => s + r.eventsReceived, 0);
  const connectionTimes = successful.map((r) => r.connectionMs);
  const allLatencies = successful.flatMap((r) => r.eventLatencies);

  console.log("═══ Summary ═══════════════════════════════");
  console.log(`  Total connections:   ${CONNECTIONS}`);
  console.log(`  Successful:          ${successful.length}`);
  console.log(`  Failed (rejected):   ${failed}`);
  console.log(`  Connections w/errors:${withErrors}`);
  console.log(`  Total SSE events:    ${totalEvents}`);
  console.log(`  Avg events/conn:     ${(totalEvents / Math.max(1, successful.length)).toFixed(1)}`);
  console.log("");
  console.log("═══ Connection Time (TTFB) ═════════════════");
  printStats("TTFB", connectionTimes);
  console.log("");
  console.log("═══ Event-to-Event Latency ═════════════════");
  printStats("Latency", allLatencies);
  console.log("");

  if (withErrors > 0) {
    console.log("═══ Errors (first 5) ═══════════════════════");
    let shown = 0;
    for (const r of successful) {
      for (const e of r.errors) {
        if (shown++ >= 5) break;
        console.log(`  - ${e}`);
      }
    }
  }

  // Exit code: 1 if more than 10% failed
  const failRate = (failed + withErrors) / CONNECTIONS;
  if (failRate > 0.1) {
    console.error(`\nFail rate ${(failRate * 100).toFixed(0)}% exceeds 10% threshold`);
    process.exit(1);
  }
  console.log("Benchmark complete ✓");
}

main().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
