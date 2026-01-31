import type { PublishProvider, ProviderResult } from './types.js';

/**
 * X API v2 create tweet response shape
 */
interface XCreateTweetResponse {
  data?: {
    id: string;
    text?: string;
  };
}

/**
 * X (Twitter) provider implementation
 */
export class XProvider implements PublishProvider {
  private readonly apiBaseUrl = 'https://api.twitter.com/2';
  
  async postText(text: string, tokenData: { access_token: string; [key: string]: unknown }): Promise<string | ProviderResult> {
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      throw new Error('Missing access_token in token data');
    }
    
    // X API v2 endpoint for creating tweets
    const url = `${this.apiBaseUrl}/tweets`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.substring(0, 280), // X character limit
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `X API error: ${response.status} ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.title || errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json() as XCreateTweetResponse;
    
    // X API v2 returns { data: { id: "...", text: "..." } }
    if (!data.data || !data.data.id) {
      throw new Error('Invalid response from X API: missing tweet ID');
    }
    
    const tweetId = data.data.id;
    const canonicalUrl = `https://twitter.com/i/web/status/${tweetId}`;
    
    // Return object with providerRef and canonicalUrl
    return {
      providerRef: tweetId,
      canonicalUrl,
    };
  }
}

