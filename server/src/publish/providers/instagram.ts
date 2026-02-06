import type { ImagePostParams, PublishProvider, ProviderResult } from './types.js';

interface InstagramCreateMediaResponse {
  id?: string;
}

interface InstagramPublishResponse {
  id?: string;
}

export class InstagramProvider implements PublishProvider {
  private readonly apiBaseUrl = 'https://graph.facebook.com/v19.0';

  async postText(
    _text: string,
    _tokenData: { access_token: string; [key: string]: unknown }
  ): Promise<string | ProviderResult> {
    throw new Error('Instagram publishing requires an image. Use postImage instead.');
  }

  async postImage(
    params: ImagePostParams,
    tokenData: { access_token: string; [key: string]: unknown }
  ): Promise<string | ProviderResult> {
    const accessToken = tokenData.access_token;
    const igUserId = String(tokenData.ig_user_id || '');

    if (!accessToken) {
      throw new Error('Missing access_token in token data');
    }
    if (!igUserId) {
      throw new Error('Missing ig_user_id in token data');
    }
    if (!params.imageUrl) {
      throw new Error('Missing imageUrl for Instagram post');
    }

    const createUrl = `${this.apiBaseUrl}/${igUserId}/media`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        image_url: params.imageUrl,
        caption: params.caption,
        access_token: accessToken,
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Instagram media create failed: ${createResponse.status} ${errorText}`);
    }

    const createData = (await createResponse.json()) as InstagramCreateMediaResponse;
    if (!createData.id) {
      throw new Error('Invalid Instagram create response: missing creation_id');
    }

    const publishUrl = `${this.apiBaseUrl}/${igUserId}/media_publish`;
    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        creation_id: createData.id,
        access_token: accessToken,
      }),
    });

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      throw new Error(`Instagram media publish failed: ${publishResponse.status} ${errorText}`);
    }

    const publishData = (await publishResponse.json()) as InstagramPublishResponse;
    if (!publishData.id) {
      throw new Error('Invalid Instagram publish response: missing media id');
    }

    return {
      providerRef: publishData.id,
    };
  }
}

