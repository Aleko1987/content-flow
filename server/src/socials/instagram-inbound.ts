import { createHash } from 'node:crypto';
import { produceNormalizedSocialEvent } from './event-producer.js';
import type { NormalizedSocialEvent } from '../social-contract/schemas.js';
import { logger } from '../utils/logger.js';

type WebhookRecord = Record<string, unknown>;

type InboundCandidate = {
  sourceEventId: string;
  actorRef: string;
  actorDisplay: string | null;
  occurredAt: string;
  sourceUrl: string | null;
  contentExcerpt: string;
  accountRefs: string[];
};

type InstagramInboundDeps = {
  resolveOwnerUserId: (accountRefs: string[]) => Promise<string | null>;
  produceEvent: (input: unknown) => Promise<unknown>;
};

export type InstagramInboundProcessResult = {
  received: number;
  forwarded: number;
  skipped_no_owner: number;
  skipped_invalid: number;
  failed: number;
};

const MAX_EXCERPT_LENGTH = 280;

const defaultDeps: InstagramInboundDeps = {
  resolveOwnerUserId: async (accountRefs: string[]) => {
    const mod = await import('../db/instagramOwnerMap.js');
    return mod.findOwnerUserIdByAccountRefs(accountRefs);
  },
  produceEvent: produceNormalizedSocialEvent,
};

const asRecord = (value: unknown): WebhookRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as WebhookRecord) : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeExcerpt = (value: unknown): string => {
  const text = asString(value) || '';
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  return text.slice(0, MAX_EXCERPT_LENGTH);
};

const toIsoDate = (value: unknown, fallbackMs: number): string => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 9_999_999_999 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return new Date(fallbackMs).toISOString();
};

const uniqueRefs = (refs: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      refs
        .map((ref) => (typeof ref === 'string' ? ref.trim() : ''))
        .filter((ref) => ref.length > 0)
    )
  );

const computeFallbackEventId = (event: unknown): string => {
  const digest = createHash('sha1').update(JSON.stringify(event)).digest('hex');
  return `ig_fallback_${digest}`;
};

const candidateFromMessaging = (entry: WebhookRecord, event: WebhookRecord): InboundCandidate | null => {
  const sender = asRecord(event.sender);
  const recipient = asRecord(event.recipient);
  const message = asRecord(event.message);
  const postback = asRecord(event.postback);

  const actorRef = asString(sender?.id);
  if (!actorRef) return null;

  const eventId =
    asString(message?.mid) ||
    asString(postback?.mid) ||
    asString(event.mid) ||
    computeFallbackEventId(event);

  const occurredAt = toIsoDate(event.timestamp, Date.now());
  const excerpt = normalizeExcerpt(message?.text ?? postback?.title ?? postback?.payload ?? '');
  const ownerRefs = uniqueRefs([asString(recipient?.id), asString(entry.id)]);

  return {
    sourceEventId: eventId,
    actorRef,
    actorDisplay: null,
    occurredAt,
    sourceUrl: null,
    contentExcerpt: excerpt,
    accountRefs: ownerRefs,
  };
};

const candidateFromChange = (entry: WebhookRecord, change: WebhookRecord): InboundCandidate | null => {
  const field = asString(change.field)?.toLowerCase() || '';
  if (!['comments', 'mentions', 'messages', 'messaging_postbacks'].includes(field)) {
    return null;
  }

  const value = asRecord(change.value) || {};
  const from = asRecord(value.from);

  const actorRef = asString(from?.id) || asString(value.sender_id) || asString(value.author_id) || asString(value.username);
  if (!actorRef) return null;

  const eventId =
    asString(value.comment_id) ||
    asString(value.id) ||
    asString(value.mid) ||
    computeFallbackEventId(change);

  const excerpt = normalizeExcerpt(
    value.text ??
      value.message ??
      value.comment_text ??
      value.verb ??
      ''
  );

  const ownerRefs = uniqueRefs([
    asString(value.instagram_account_id),
    asString(value.ig_id),
    asString(value.page_id),
    asString(entry.id),
  ]);

  return {
    sourceEventId: eventId,
    actorRef,
    actorDisplay: asString(from?.username) || asString(from?.name) || asString(value.username),
    occurredAt: toIsoDate(value.created_time ?? value.timestamp ?? entry.time, Date.now()),
    sourceUrl: asString(value.permalink_url) || asString(value.permalink) || asString(value.link),
    contentExcerpt: excerpt,
    accountRefs: ownerRefs,
  };
};

export const extractInstagramInboundCandidates = (payload: unknown): InboundCandidate[] => {
  const body = asRecord(payload);
  if (!body) return [];
  const entry = Array.isArray(body.entry) ? body.entry : [];
  const candidates: InboundCandidate[] = [];

  for (const rawEntry of entry) {
    const entryObj = asRecord(rawEntry);
    if (!entryObj) continue;

    const messagingEvents = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
    for (const rawEvent of messagingEvents) {
      const event = asRecord(rawEvent);
      if (!event) continue;
      const candidate = candidateFromMessaging(entryObj, event);
      if (candidate) candidates.push(candidate);
    }

    const changes = Array.isArray(entryObj.changes) ? entryObj.changes : [];
    for (const rawChange of changes) {
      const change = asRecord(rawChange);
      if (!change) continue;
      const candidate = candidateFromChange(entryObj, change);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
};

export const processInstagramInboundWebhook = async (
  payload: unknown,
  deps: Partial<InstagramInboundDeps> = {}
): Promise<InstagramInboundProcessResult> => {
  const resolvedDeps: InstagramInboundDeps = { ...defaultDeps, ...deps };
  const candidates = extractInstagramInboundCandidates(payload);

  let forwarded = 0;
  let skippedNoOwner = 0;
  let skippedInvalid = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (!candidate.actorRef || !candidate.sourceEventId) {
      skippedInvalid += 1;
      continue;
    }

    const ownerUserId = await resolvedDeps.resolveOwnerUserId(candidate.accountRefs);
    if (!ownerUserId) {
      skippedNoOwner += 1;
      logger.warn('Skipping Instagram inbound event without owner mapping', {
        sourceEventId: candidate.sourceEventId,
        accountRefs: candidate.accountRefs,
      });
      continue;
    }

    const normalizedEvent: NormalizedSocialEvent = {
      version: 'v1',
      source_event_id: candidate.sourceEventId,
      platform: 'instagram',
      event_type: 'inbound_message',
      actor_ref: candidate.actorRef,
      actor_display: candidate.actorDisplay,
      lead_match_confidence: null,
      occurred_at: candidate.occurredAt,
      source_url: candidate.sourceUrl,
      content_excerpt: candidate.contentExcerpt,
      metadata: {
        owner_user_id: ownerUserId,
        lead_id: null,
        priority: 65,
      },
    };

    try {
      await resolvedDeps.produceEvent(normalizedEvent);
      forwarded += 1;
    } catch (error) {
      failed += 1;
      logger.error('Failed to forward Instagram inbound event', {
        sourceEventId: candidate.sourceEventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    received: candidates.length,
    forwarded,
    skipped_no_owner: skippedNoOwner,
    skipped_invalid: skippedInvalid,
    failed,
  };
};
