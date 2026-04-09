/**
 * Provider result with reference and optional canonical URL
 */
export interface ProviderResult {
  providerRef: string;
  canonicalUrl?: string;
}

export interface ImagePostParams {
  caption: string;
  imageUrl: string;
}

export interface VideoPostParams {
  caption: string;
  videoUrl: string;
  coverImageUrl?: string;
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

  /**
   * Publish an image with caption
   * @param params - Image post parameters
   * @param tokenData - Decrypted OAuth token data
   * @returns Provider reference or object with providerRef and optional canonicalUrl
   */
  postImage?: (params: ImagePostParams, tokenData: { access_token: string; [key: string]: unknown }) => Promise<string | ProviderResult>;

  /**
   * Publish a video with caption
   * @param params - Video post parameters
   * @param tokenData - Decrypted OAuth token data
   * @returns Provider reference or object with providerRef and optional canonicalUrl
   */
  postVideo?: (params: VideoPostParams, tokenData: { access_token: string; [key: string]: unknown }) => Promise<string | ProviderResult>;
}

export type ProviderKey = 'x' | 'instagram' | 'facebook';

