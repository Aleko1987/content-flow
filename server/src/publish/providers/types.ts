/**
 * Provider result with reference and optional canonical URL
 */
export interface ProviderResult {
  providerRef: string;
  canonicalUrl?: string;
}

/**
 * Provider adapter interface for publishing content
 */
export interface PublishProvider {
  /**
   * Publish text content
   * @param text - The text content to publish
   * @param tokenData - Decrypted OAuth token data
   * @returns Provider reference (e.g., tweet ID) or object with providerRef and optional canonicalUrl
   */
  postText(text: string, tokenData: { access_token: string; [key: string]: unknown }): Promise<string | ProviderResult>;
}

export type ProviderKey = 'x';

