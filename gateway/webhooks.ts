import { api } from "encore.dev/api";
import { Subscription } from "encore.dev/pubsub";
import log from "encore.dev/log";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { taskEvents } from "../tasks/events";
import { agentErrorEvents } from "../agent/event-bus";
import { healingEvents } from "../registry/events";

// --- Types ---

export interface WebhookConfig {
  id: string;
  projectId: string;
  url: string;
  /** Event patterns to subscribe to: "task.completed", "agent.error", "deploy.success", "*" */
  events: string[];
  /** HMAC secret used to sign payloads */
  secret: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number | null;
  success: boolean;
  deliveredAt: string;
}

// --- HMAC signature ---

/**
 * Compute HMAC-SHA256 signature for a payload.
 * Header format: `X-TheFold-Signature: sha256=<hex>`
 */
export function computeSignature(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = computeSignature(secret, body);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// --- Delivery ---

/**
 * Send a webhook payload to a single URL with HMAC signature.
 * Logs delivery result but never throws — fire-and-forget safe.
 */
export async function sendWebhook(
  config: WebhookConfig,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!config.enabled) return false;

  const eventMatches = config.events.includes("*") || config.events.includes(eventType);
  if (!eventMatches) return false;

  const body = JSON.stringify({ event: eventType, payload, sentAt: new Date().toISOString() });
  const signature = computeSignature(config.secret, body);
  const startMs = Date.now();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TheFold-Signature": signature,
        "X-TheFold-Event": eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 1000);
    success = res.ok;

    if (!success) {
      log.warn("Webhook delivery failed", { url: config.url, event: eventType, status: res.status });
    }
  } catch (err) {
    log.warn("Webhook delivery error", {
      url: config.url,
      event: eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const durationMs = Date.now() - startMs;

  // Record delivery (fire-and-forget — don't block on DB write)
  db.exec`
    INSERT INTO webhook_deliveries
      (webhook_id, event_type, payload, response_status, response_body, duration_ms, success)
    VALUES
      (${config.id}, ${eventType}, ${JSON.stringify(payload)}::jsonb,
       ${responseStatus}, ${responseBody}, ${durationMs}, ${success})
  `.catch(err => {
    log.warn("Failed to record webhook delivery", { error: String(err) });
  });

  return success;
}

// --- Fan-out: dispatch to all matching webhooks for a project ---

async function dispatchEvent(
  projectId: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const rows = db.query<{
    id: string; project_id: string; url: string; events: string[];
    secret: string; enabled: boolean; created_at: Date; updated_at: Date;
  }>`
    SELECT * FROM webhook_configs
    WHERE enabled = true
      AND (project_id = ${projectId ?? ""} OR project_id = '*')
    ORDER BY created_at ASC
  `;

  const configs: WebhookConfig[] = [];
  for await (const row of rows) {
    configs.push({
      id: row.id,
      projectId: row.project_id,
      url: row.url,
      events: row.events,
      secret: row.secret,
      enabled: row.enabled,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  await Promise.allSettled(
    configs.map(cfg => sendWebhook(cfg, eventType, payload)),
  );
}

// --- Pub/Sub subscriptions ---

/** task.completed */
const _taskWebhookSub = new Subscription(taskEvents, "webhook-task-events", {
  handler: async (event) => {
    if (event.action !== "completed") return;
    await dispatchEvent(event.repo ?? undefined, `task.${event.action}`, {
      taskId: event.taskId,
      repo: event.repo ?? undefined,
      action: event.action,
    });
  },
});

/** agent.error */
const _agentErrorWebhookSub = new Subscription(agentErrorEvents, "webhook-agent-errors", {
  handler: async (event) => {
    await dispatchEvent(event.repo, "agent.error", {
      taskId: event.taskId,
      error: event.error,
      phase: event.phase,
      attempts: event.attempts,
    });
  },
});

/** deploy.success — fired when healing completes successfully */
const _healingWebhookSub = new Subscription(healingEvents, "webhook-healing-events", {
  handler: async (event) => {
    const eventType = event.tasksCreated > 0 ? "deploy.success" : "deploy.skipped";
    for (const repo of event.affectedRepos) {
      await dispatchEvent(repo, eventType, {
        componentId: event.componentId,
        componentName: event.componentName,
        severity: event.severity,
        affectedRepos: event.affectedRepos,
        tasksCreated: event.tasksCreated,
      });
    }
  },
});

// --- API endpoints ---

interface RegisterWebhookRequest {
  projectId: string;
  url: string;
  events: string[];
  secret: string;
}

export const registerWebhook = api(
  { method: "POST", path: "/gateway/webhooks/register", expose: true, auth: true },
  async (req: RegisterWebhookRequest): Promise<{ webhook: WebhookConfig }> => {
    const row = await db.queryRow<{
      id: string; project_id: string; url: string; events: string[];
      secret: string; enabled: boolean; created_at: Date; updated_at: Date;
    }>`
      INSERT INTO webhook_configs (project_id, url, events, secret)
      VALUES (${req.projectId}, ${req.url}, ${req.events}, ${req.secret})
      RETURNING *
    `;

    if (!row) throw new Error("Failed to create webhook");

    return {
      webhook: {
        id: row.id,
        projectId: row.project_id,
        url: row.url,
        events: row.events,
        secret: row.secret,
        enabled: row.enabled,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    };
  },
);

export const listWebhooks = api(
  { method: "GET", path: "/gateway/webhooks", expose: true, auth: true },
  async (): Promise<{ webhooks: WebhookConfig[] }> => {
    const rows = db.query<{
      id: string; project_id: string; url: string; events: string[];
      secret: string; enabled: boolean; created_at: Date; updated_at: Date;
    }>`
      SELECT * FROM webhook_configs ORDER BY created_at DESC
    `;

    const webhooks: WebhookConfig[] = [];
    for await (const row of rows) {
      webhooks.push({
        id: row.id,
        projectId: row.project_id,
        url: row.url,
        events: row.events,
        secret: "***", // Never return secret in list
        enabled: row.enabled,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      });
    }

    return { webhooks };
  },
);

export const deleteWebhook = api(
  { method: "POST", path: "/gateway/webhooks/delete", expose: true, auth: true },
  async (req: { id: string }): Promise<{ deleted: boolean }> => {
    await db.exec`DELETE FROM webhook_configs WHERE id = ${req.id}`;
    return { deleted: true };
  },
);
