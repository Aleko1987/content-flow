import type { z } from 'zod';
import { actionTypeSchema } from '../social-contract/schemas.js';
import { reasonCodes } from './reason-codes.js';

export type ActionType = z.infer<typeof actionTypeSchema>;
export type CapabilityPlatform = 'instagram' | 'facebook' | 'whatsapp';

export type CapabilityEntry = {
  action_type: ActionType;
  supported: boolean;
  api_endpoints: string[];
  required_scopes: string[];
  account_prerequisites: string[];
  rate_limit_constraints: string[];
  policy_constraints: string[];
  fallback_behavior: string;
  reason_code_when_unsupported: string | null;
  docs_urls: string[];
};

export type PlatformCapabilityMatrix = {
  platform: CapabilityPlatform;
  version: 'v1';
  reviewed_at: string;
  source: 'meta_official_docs';
  actions: CapabilityEntry[];
};

const instagramActions: CapabilityEntry[] = [
  {
    action_type: 'dm',
    supported: true,
    api_endpoints: ['POST /{page-id}/messages'],
    required_scopes: ['instagram_manage_messages', 'pages_manage_metadata'],
    account_prerequisites: [
      'Instagram professional account linked to a Facebook Page',
      'Connected tools access enabled in Instagram message controls',
      'Page access token with instagram_manage_messages',
    ],
    rate_limit_constraints: ['Provider-enforced Graph/Messaging API limits'],
    policy_constraints: ['24-hour messaging window and Meta messaging policy compliance'],
    fallback_behavior: 'return failed when provider rejects window/policy conditions',
    reason_code_when_unsupported: null,
    docs_urls: [
      'https://developers.facebook.com/docs/instagram-messaging/get-started/',
      'https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message/',
    ],
  },
  {
    action_type: 'story_reply',
    supported: true,
    api_endpoints: ['POST /{page-id}/messages'],
    required_scopes: ['instagram_manage_messages', 'pages_manage_metadata'],
    account_prerequisites: ['Instagram professional account linked to a Facebook Page'],
    rate_limit_constraints: ['Provider-enforced Graph/Messaging API limits'],
    policy_constraints: ['Must satisfy messaging window and anti-spam policy'],
    fallback_behavior: 'return failed when provider rejects reply context',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/instagram-messaging/get-started/'],
  },
  {
    action_type: 'comment',
    supported: true,
    api_endpoints: ['POST /{ig-media-id}/comments?message={message}'],
    required_scopes: ['instagram_manage_comments', 'pages_read_engagement'],
    account_prerequisites: ['Instagram professional account'],
    rate_limit_constraints: ['Provider-enforced Graph API limits'],
    policy_constraints: ['No live-video comment creation support'],
    fallback_behavior: 'return failed with provider reason when comment is disallowed',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments/'],
  },
  {
    action_type: 'reply',
    supported: true,
    api_endpoints: ['POST /{ig-comment-id}/replies?message={message}'],
    required_scopes: ['instagram_manage_comments', 'pages_read_engagement', 'pages_show_list'],
    account_prerequisites: ['Instagram professional account'],
    rate_limit_constraints: ['Provider-enforced Graph API limits'],
    policy_constraints: ['Only top-level comments can be replied to'],
    fallback_behavior: 'return failed with provider reason when reply target is invalid',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/'],
  },
  {
    action_type: 'mention',
    supported: true,
    api_endpoints: ['POST /{ig-user-id}/mentions?media_id={media_id}&message={message}'],
    required_scopes: ['instagram_manage_comments', 'pages_read_engagement', 'pages_show_list'],
    account_prerequisites: ['Instagram professional account'],
    rate_limit_constraints: ['Provider-enforced Graph API limits'],
    policy_constraints: ['Requires mention context and target media/comment identifiers'],
    fallback_behavior: 'return blocked when mention context metadata is missing',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentions/'],
  },
  {
    action_type: 'like',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No official Instagram Graph API endpoint for bot-driven likes'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
  {
    action_type: 'share',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No official API for arbitrary user-level share actions'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
  {
    action_type: 'follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Follow/unfollow automation is not available in current Instagram APIs'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
  {
    action_type: 'account_follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Follow/unfollow automation is not available in current Instagram APIs'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
  {
    action_type: 'add',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No Instagram API concept for this action'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
  {
    action_type: 'group_join',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Instagram has no API for group join automation'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  },
];

export const instagramCapabilityMatrix: PlatformCapabilityMatrix = {
  platform: 'instagram',
  version: 'v1',
  reviewed_at: '2026-04-30',
  source: 'meta_official_docs',
  actions: instagramActions,
};

const facebookActions: CapabilityEntry[] = [
  {
    action_type: 'dm',
    supported: true,
    api_endpoints: ['POST /{page-id}/messages'],
    required_scopes: ['pages_messaging'],
    account_prerequisites: ['Facebook Page connected via OAuth with page access token'],
    rate_limit_constraints: ['Provider-enforced Messenger Platform limits'],
    policy_constraints: ['Messenger platform policy and user messaging windows apply'],
    fallback_behavior: 'return failed when provider rejects policy/window',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/messenger-platform/reference/send-api/'],
  },
  {
    action_type: 'comment',
    supported: true,
    api_endpoints: ['POST /{object-id}/comments?message={message}'],
    required_scopes: ['pages_manage_engagement'],
    account_prerequisites: ['Facebook Page connected via OAuth with page access token'],
    rate_limit_constraints: ['Provider-enforced Graph API limits'],
    policy_constraints: ['Target object must allow comments'],
    fallback_behavior: 'return failed when target is not commentable',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/graph-api/reference/object/comments/'],
  },
  {
    action_type: 'reply',
    supported: true,
    api_endpoints: ['POST /{comment-id}/comments?message={message}'],
    required_scopes: ['pages_manage_engagement'],
    account_prerequisites: ['Facebook Page connected via OAuth with page access token'],
    rate_limit_constraints: ['Provider-enforced Graph API limits'],
    policy_constraints: ['Target must be a valid Facebook comment ID'],
    fallback_behavior: 'return failed when reply target is invalid',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/graph-api/reference/object/comments/'],
  },
  {
    action_type: 'like',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No safe generic like automation endpoint in current DO-Socials integration'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'share',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No generic share action in current execution contract mapping'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Follow automation is not exposed through this integration'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'account_follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Follow automation is not exposed through this integration'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'add',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No Facebook API concept for this execution action'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'group_join',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Group join automation is not supported in this integration'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'mention',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['No standalone mention action endpoint in this execution mapping'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
  {
    action_type: 'story_reply',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Story reply action is not mapped for Facebook in this contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/graph-api'],
  },
];

export const facebookCapabilityMatrix: PlatformCapabilityMatrix = {
  platform: 'facebook',
  version: 'v1',
  reviewed_at: '2026-04-30',
  source: 'meta_official_docs',
  actions: facebookActions,
};

const whatsappActions: CapabilityEntry[] = [
  {
    action_type: 'dm',
    supported: true,
    api_endpoints: ['POST EARTHCURE_WHATSAPP_SEND_URL bridge'],
    required_scopes: ['Bridge token authorization'],
    account_prerequisites: ['WhatsApp bridge configured in environment'],
    rate_limit_constraints: ['Bridge and provider throughput limits'],
    policy_constraints: ['Message template/session policy enforced upstream'],
    fallback_behavior: 'return failed on bridge/provider rejection',
    reason_code_when_unsupported: null,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'like',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'comment',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'reply',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'share',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'add',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'group_join',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'account_follow',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'mention',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
  {
    action_type: 'story_reply',
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['WhatsApp does not support this action type in execution contract'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/whatsapp/cloud-api'],
  },
];

export const whatsappCapabilityMatrix: PlatformCapabilityMatrix = {
  platform: 'whatsapp',
  version: 'v1',
  reviewed_at: '2026-04-30',
  source: 'meta_official_docs',
  actions: whatsappActions,
};

export const socialCapabilityMatrices: Record<CapabilityPlatform, PlatformCapabilityMatrix> = {
  instagram: instagramCapabilityMatrix,
  facebook: facebookCapabilityMatrix,
  whatsapp: whatsappCapabilityMatrix,
};

const actionAliasMap: Partial<Record<ActionType, ActionType>> = {
  follow: 'account_follow',
};

const resolveCapabilityForMatrix = (matrix: PlatformCapabilityMatrix, actionType: ActionType): CapabilityEntry => {
  const normalized = actionAliasMap[actionType] ?? actionType;
  const found = matrix.actions.find((action) => action.action_type === normalized);
  if (found) {
    return found;
  }
  return {
    action_type: actionType,
    supported: false,
    api_endpoints: [],
    required_scopes: [],
    account_prerequisites: [],
    rate_limit_constraints: [],
    policy_constraints: ['Action is unknown to the platform capability matrix'],
    fallback_behavior: 'return unsupported',
    reason_code_when_unsupported: reasonCodes.actionNotSupportedByProvider,
    docs_urls: ['https://developers.facebook.com/docs/instagram'],
  };
};

export const resolveInstagramCapability = (actionType: ActionType): CapabilityEntry =>
  resolveCapabilityForMatrix(instagramCapabilityMatrix, actionType);

export const resolveFacebookCapability = (actionType: ActionType): CapabilityEntry =>
  resolveCapabilityForMatrix(facebookCapabilityMatrix, actionType);

export const resolveWhatsAppCapability = (actionType: ActionType): CapabilityEntry =>
  resolveCapabilityForMatrix(whatsappCapabilityMatrix, actionType);
