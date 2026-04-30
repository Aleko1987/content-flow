import assert from 'node:assert/strict';
import test from 'node:test';
import {
  facebookCapabilityMatrix,
  instagramCapabilityMatrix,
  resolveFacebookCapability,
  resolveInstagramCapability,
  resolveWhatsAppCapability,
  socialCapabilityMatrices,
  whatsappCapabilityMatrix,
} from './capability-matrix.js';

test('capability matrix marks supported instagram actions correctly', () => {
  const dm = resolveInstagramCapability('dm');
  const comment = resolveInstagramCapability('comment');
  const follow = resolveInstagramCapability('follow');

  assert.equal(dm.supported, true);
  assert.equal(comment.supported, true);
  assert.equal(follow.supported, false);
  assert.equal(follow.reason_code_when_unsupported, 'action_not_supported_by_provider');
});

test('capability matrix includes deterministic metadata for every action', () => {
  const matrices = [instagramCapabilityMatrix, facebookCapabilityMatrix, whatsappCapabilityMatrix];
  for (const matrix of matrices) {
    for (const action of matrix.actions) {
      assert.ok(action.action_type.length > 0);
      assert.ok(Array.isArray(action.policy_constraints));
      assert.ok(action.fallback_behavior.length > 0);
      if (!action.supported) {
        assert.equal(action.reason_code_when_unsupported, 'action_not_supported_by_provider');
      }
    }
  }
});

test('facebook and whatsapp capability resolver exposes supported actions', () => {
  assert.equal(resolveFacebookCapability('dm').supported, true);
  assert.equal(resolveFacebookCapability('story_reply').supported, false);
  assert.equal(resolveWhatsAppCapability('dm').supported, true);
  assert.equal(resolveWhatsAppCapability('comment').supported, false);
});

test('platform capability map includes instagram facebook and whatsapp', () => {
  assert.ok(socialCapabilityMatrices.instagram);
  assert.ok(socialCapabilityMatrices.facebook);
  assert.ok(socialCapabilityMatrices.whatsapp);
});
