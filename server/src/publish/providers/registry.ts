import type { PublishProvider, ProviderKey } from './types.js';
import { InstagramProvider } from './instagram.js';
import { XProvider } from './x.js';

const providers: Map<ProviderKey, PublishProvider> = new Map([
  ['x', new XProvider()],
  ['instagram', new InstagramProvider()],
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

