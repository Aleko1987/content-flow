import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime({ offset: true });
const metadataSchema = z.record(z.unknown());

export const platformSchema = z.enum(['facebook', 'instagram', 'whatsapp']);
export const eventTypeSchema = z.enum([
  'inbound_message',
  'comment',
  'reply',
  'mention',
  'post_activity',
  'profile_activity',
]);
export const actionTypeSchema = z.enum(['like', 'comment', 'reply', 'dm']);
export const executeStatusSchema = z.enum(['succeeded', 'failed', 'blocked', 'unsupported']);

export const normalizedSocialEventSchema = z
  .object({
    version: z.literal('v1'),
    source_event_id: z.string().min(1),
    platform: platformSchema,
    event_type: eventTypeSchema,
    actor_ref: z.string().min(1),
    actor_display: z.string().nullable(),
    lead_match_confidence: z.number().min(0).max(1).nullable(),
    occurred_at: isoDateTimeSchema,
    source_url: z.string().nullable(),
    content_excerpt: z.string().nullable(),
    metadata: metadataSchema,
  })
  .strict();

export const executeTaskRequestSchema = z
  .object({
    version: z.literal('v1'),
    task_id: z.string().min(1),
    idempotency_key: z.string().min(1),
    platform: platformSchema,
    action_type: actionTypeSchema,
    target_ref: z.string().min(1),
    lead_ref: z.string().nullable(),
    content: z.string().nullable(),
    metadata: metadataSchema,
  })
  .strict();

export const executeTaskResponseSchema = z
  .object({
    version: z.literal('v1'),
    task_id: z.string().min(1),
    status: executeStatusSchema,
    provider_action_id: z.string().nullable(),
    occurred_at: isoDateTimeSchema,
    reason_code: z.string().nullable(),
    reason_message: z.string().nullable(),
    raw: z.record(z.unknown()).nullable(),
  })
  .strict();

export type NormalizedSocialEvent = z.infer<typeof normalizedSocialEventSchema>;
export type ExecuteTaskRequest = z.infer<typeof executeTaskRequestSchema>;
export type ExecuteTaskResponse = z.infer<typeof executeTaskResponseSchema>;
