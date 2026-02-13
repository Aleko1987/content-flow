import type { PublishProvider, ProviderKey } from './types.js';
import { FacebookProvider } from './facebook.js';
import { InstagramProvider } from './instagram.js';
import { XProvider } from './x.js';

const providers = new Map<ProviderKey, PublishProvider>([
  ['x', new XProvider()],
  ['instagram', new InstagramProvider()],
  ['facebook', new FacebookProvider()],
]);

/**
 * Get provider instance by key
 */
export function getProvider(providerKey: string): PublishProvider {
  const provider = providers.get(providerKey as ProviderKey);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }
  return provider;
}

