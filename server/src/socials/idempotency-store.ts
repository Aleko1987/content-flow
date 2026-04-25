import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { socialEventDeliveries, socialExecutionIdempotency } from '../db/schema.js';
import type { ExecuteTaskRequest, ExecuteTaskResponse, NormalizedSocialEvent } from '../social-contract/schemas.js';

export const socialIdempotencyStore = {
  async getEventDelivery(sourceEventId: string) {
    const rows = await db
      .select()
      .from(socialEventDeliveries)
      .where(eq(socialEventDeliveries.sourceEventId, sourceEventId))
      .limit(1);
    return rows[0] ?? null;
  },

  async upsertEventPending(event: NormalizedSocialEvent) {
    const now = new Date();
    await db
      .insert(socialEventDeliveries)
      .values({
        sourceEventId: event.source_event_id,
        platform: event.platform,
        eventType: event.event_type,
        occurredAt: new Date(event.occurred_at),
        payload: event as Record<string, unknown>,
        deliveryStatus: 'pending',
        deliveryAttempts: 0,
        deliveredAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  },

  async markEventDelivered(sourceEventId: string) {
    await db
      .update(socialEventDeliveries)
      .set({
        deliveryStatus: 'delivered',
        deliveredAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(socialEventDeliveries.sourceEventId, sourceEventId));
  },

  async markEventDeliveryAttempt(sourceEventId: string, errorMessage: string | null) {
    await db
      .update(socialEventDeliveries)
      .set({
        deliveryStatus: errorMessage ? 'failed' : 'pending',
        deliveryAttempts: sql`${socialEventDeliveries.deliveryAttempts} + 1`,
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(socialEventDeliveries.sourceEventId, sourceEventId));
  },

  async getExecutionResponse(idempotencyKey: string): Promise<ExecuteTaskResponse | null> {
    const rows = await db
      .select()
      .from(socialExecutionIdempotency)
      .where(eq(socialExecutionIdempotency.idempotencyKey, idempotencyKey))
      .limit(1);
    const row = rows[0];
    if (!row?.responsePayload) return null;
    return row.responsePayload as ExecuteTaskResponse;
  },

  async ensureExecutionRequest(request: ExecuteTaskRequest) {
    const now = new Date();
    await db
      .insert(socialExecutionIdempotency)
      .values({
        idempotencyKey: request.idempotency_key,
        taskId: request.task_id,
        requestPayload: request as Record<string, unknown>,
        responsePayload: null,
        status: 'pending',
        providerActionId: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  },

  async saveExecutionResponse(request: ExecuteTaskRequest, response: ExecuteTaskResponse) {
    await db
      .update(socialExecutionIdempotency)
      .set({
        responsePayload: response as Record<string, unknown>,
        status: response.status,
        providerActionId: response.provider_action_id,
        updatedAt: new Date(),
      })
      .where(eq(socialExecutionIdempotency.idempotencyKey, request.idempotency_key));
  },
};
