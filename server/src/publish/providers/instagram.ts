import type { ImagePostParams, PublishProvider, ProviderResult, VideoPostParams } from './types.js';

interface InstagramCreateMediaResponse {
  id?: string;
}

interface InstagramPublishResponse {
  id?: string;
}

interface InstagramMediaStatusResponse {
  id?: string;
  status_code?: string;
}

export class InstagramProvider implements PublishProvider {
  private readonly apiBaseUrl = 'https://graph.facebook.com/v19.0';
  private readonly maxVideoStatusChecks = 12;
  private readonly videoStatusIntervalMs = 5_000;

  async postText(
    _text: string,
    _tokenData: { access_token: string; [key: string]: unknown }
  ): Promise<string | ProviderResult> {
    throw new Error('Instagram publishing requires media. Use postImage or postVideo instead.');
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

    const creationId = await this.createMedia({
      igUserId,
      accessToken,
      body: new URLSearchParams({
        image_url: params.imageUrl,
        caption: params.caption,
      }),
    });

    const publishId = await this.publishMedia({ igUserId, accessToken, creationId });
    return { providerRef: publishId };
  }

  async postVideo(
    params: VideoPostParams,
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
    if (!params.videoUrl) {
      throw new Error('Missing videoUrl for Instagram post');
    }

    const creationId = await this.createMedia({
      igUserId,
      accessToken,
      body: new URLSearchParams({
        video_url: params.videoUrl,
        caption: params.caption,
        media_type: 'REELS',
        ...(params.coverImageUrl ? { cover_url: params.coverImageUrl } : {}),
      }),
    });

    await this.waitForVideoReady({ creationId, accessToken });
    const publishId = await this.publishMedia({ igUserId, accessToken, creationId });
    return { providerRef: publishId };
  }

  private async createMedia(params: {
    igUserId: string;
    accessToken: string;
    body: URLSearchParams;
  }): Promise<string> {
    params.body.set('access_token', params.accessToken);
    const createUrl = `${this.apiBaseUrl}/${params.igUserId}/media`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.body,
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Instagram media create failed: ${createResponse.status} ${errorText}`);
    }

    const createData = (await createResponse.json()) as InstagramCreateMediaResponse;
    if (!createData.id) {
      throw new Error('Invalid Instagram create response: missing creation_id');
    }
    return createData.id;
  }

  private async publishMedia(params: {
    igUserId: string;
    accessToken: string;
    creationId: string;
  }): Promise<string> {
    const publishUrl = `${this.apiBaseUrl}/${params.igUserId}/media_publish`;
    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: params.creationId,
        access_token: params.accessToken,
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
    return publishData.id;
  }

  private async waitForVideoReady(params: { creationId: string; accessToken: string }): Promise<void> {
    for (let attempt = 0; attempt < this.maxVideoStatusChecks; attempt += 1) {
      const statusUrl = `${this.apiBaseUrl}/${params.creationId}?${new URLSearchParams({
        fields: 'status_code',
        access_token: params.accessToken,
      }).toString()}`;
      const response = await fetch(statusUrl, { method: 'GET' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Instagram media status failed: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as InstagramMediaStatusResponse;
      const status = String(data.status_code || '').toUpperCase();
      if (status === 'FINISHED') {
        return;
      }
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Instagram video processing failed with status: ${status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, this.videoStatusIntervalMs));
    }

    throw new Error('Instagram video processing did not finish in time');
  }
}

