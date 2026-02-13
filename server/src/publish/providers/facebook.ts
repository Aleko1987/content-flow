import type { PublishProvider, ProviderResult } from './types.js';

interface FacebookFeedResponse {
  id?: string;
}

export class FacebookProvider implements PublishProvider {
  private readonly apiBaseUrl = 'https://graph.facebook.com/v19.0';

  async postText(
    text: string,
    tokenData: { access_token: string; [key: string]: unknown }
  ): Promise<string | ProviderResult> {
    const accessToken = tokenData.access_token;
    const pageId = String(tokenData.page_id || '');

    if (!accessToken) {
      throw new Error('Missing access_token in token data');
    }
    if (!pageId) {
      throw new Error('Missing page_id in token data');
    }

    const response = await fetch(`${this.apiBaseUrl}/${pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        message: text,
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook post failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as FacebookFeedResponse;
    if (!data.id) {
      throw new Error('Invalid Facebook response: missing post id');
    }

    const postIdParts = data.id.split('_');
    const canonicalUrl = postIdParts.length === 2
      ? `https://www.facebook.com/${postIdParts[0]}/posts/${postIdParts[1]}`
      : undefined;

    return {
      providerRef: data.id,
      canonicalUrl,
    };
  }
}


