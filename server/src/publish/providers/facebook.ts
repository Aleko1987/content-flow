import type { ImagePostParams, PublishProvider, ProviderResult, VideoPostParams } from './types.js';

interface FacebookFeedResponse {
  id?: string;
}

interface FacebookPostDetailsResponse {
  permalink_url?: string;
  is_published?: boolean;
}

interface FacebookPhotoResponse {
  id?: string; // photo id
  post_id?: string; // pageId_postId (when published to feed)
}

interface FacebookVideoResponse {
  id?: string; // video id
  post_id?: string; // pageId_postId (if returned)
}

export class FacebookProvider implements PublishProvider {
  private readonly apiBaseUrl = 'https://graph.facebook.com/v19.0';

  private buildStablePermalinkFromCompositeId(compositeId: string): string | null {
    // Graph feed post ids are typically "{pageId}_{postId}".
    const parts = compositeId.split('_');
    if (parts.length !== 2) return null;
    const [pageId, postId] = parts;
    if (!pageId || !postId) return null;
    // This format tends to be more robust than "/{pageId}/posts/{postId}" and avoids
    // cases where Graph returns a permalink_url pointing at a different numeric id.
    return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(postId)}&id=${encodeURIComponent(pageId)}`;
  }

  private async tryFetchPermalink(
    objectId: string,
    accessToken: string
  ): Promise<{ permalinkUrl?: string; isPublished?: boolean } | null> {
    try {
      const params = new URLSearchParams({
        fields: 'permalink_url,is_published',
        access_token: accessToken,
      });
      const response = await fetch(`${this.apiBaseUrl}/${encodeURIComponent(objectId)}?${params.toString()}`);
      if (!response.ok) return null;
      const data = (await response.json()) as FacebookPostDetailsResponse;
      return { permalinkUrl: data.permalink_url, isPublished: data.is_published };
    } catch {
      return null;
    }
  }

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

    const details = await this.tryFetchPermalink(data.id, accessToken);
    if (details?.isPublished === false) {
      throw new Error('Facebook created an unpublished post. Check Page settings and permissions.');
    }

    const postIdParts = data.id.split('_');
    const legacyFallbackUrl = postIdParts.length === 2
      ? `https://www.facebook.com/${postIdParts[0]}/posts/${postIdParts[1]}`
      : undefined;
    const stablePermalink = this.buildStablePermalinkFromCompositeId(data.id);
    // Prefer Graph-provided permalink_url first. It can be a pfbid-based URL that resolves
    // better across viewers than permalink.php or /{pageId}/posts/{postId}.
    const canonicalUrl = details?.permalinkUrl || stablePermalink || legacyFallbackUrl;

    return {
      providerRef: data.id,
      canonicalUrl,
    };
  }

  async postImage(
    params: ImagePostParams,
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
    if (!params.imageUrl) {
      throw new Error('Missing imageUrl for Facebook photo post');
    }

    // IMPORTANT:
    // Posting directly to /{pageId}/photos can yield a "photo object URL" (photo?fbid=...)
    // that admins can open, but some non-admin viewers cannot (Facebook error: content isn't available).
    //
    // To reliably create a public Page feed post with an image, use:
    // 1) upload photo as unpublished (published=false) -> get photo id (media_fbid)
    // 2) create a feed post with attached_media -> get post id (pageId_postId)
    // https://developers.facebook.com/docs/graph-api/reference/page/photos/
    // https://developers.facebook.com/docs/graph-api/reference/page/feed/
    const uploadResponse = await fetch(`${this.apiBaseUrl}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        url: params.imageUrl,
        // Keep caption on the feed post (message) so the feed story is canonical.
        caption: '',
        published: 'false',
        access_token: accessToken,
      }),
    });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Facebook photo upload failed: ${uploadResponse.status} ${errorText}`);
    }
    const uploadData = (await uploadResponse.json()) as FacebookPhotoResponse;
    const photoId = uploadData.id;
    if (!photoId) {
      throw new Error('Invalid Facebook photo upload response: missing id');
    }

    const feedBody = new URLSearchParams({
      message: params.caption || '',
      access_token: accessToken,
    });
    // Graph expects JSON in the attached_media param.
    feedBody.set('attached_media[0]', JSON.stringify({ media_fbid: photoId }));

    const feedResponse = await fetch(`${this.apiBaseUrl}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: feedBody,
    });
    if (!feedResponse.ok) {
      const errorText = await feedResponse.text();
      throw new Error(`Facebook feed post failed: ${feedResponse.status} ${errorText}`);
    }
    const feedData = (await feedResponse.json()) as { id?: string };
    if (!feedData.id) {
      throw new Error('Invalid Facebook feed response: missing post id');
    }

    const details = await this.tryFetchPermalink(feedData.id, accessToken);
    if (details?.isPublished === false) {
      throw new Error('Facebook created an unpublished feed post. Check Page settings and permissions.');
    }

    const postIdParts = feedData.id.split('_');
    const legacyFallbackUrl = postIdParts.length === 2
      ? `https://www.facebook.com/${postIdParts[0]}/posts/${postIdParts[1]}`
      : undefined;
    const stablePermalink = this.buildStablePermalinkFromCompositeId(feedData.id);
    const canonicalUrl = details?.permalinkUrl || stablePermalink || legacyFallbackUrl;

    return { providerRef: feedData.id, canonicalUrl };
  }

  async postVideo(
    params: VideoPostParams,
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
    if (!params.videoUrl) {
      throw new Error('Missing videoUrl for Facebook video post');
    }

    const response = await fetch(`${this.apiBaseUrl}/${pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        file_url: params.videoUrl,
        description: params.caption || '',
        published: 'true',
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook video post failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as FacebookVideoResponse;
    if (!data.id) {
      throw new Error('Invalid Facebook video response: missing id');
    }

    const preferredRef = data.post_id || data.id;
    const details = await this.tryFetchPermalink(preferredRef, accessToken);
    const canonicalUrl = details?.permalinkUrl;

    return {
      providerRef: preferredRef,
      canonicalUrl,
    };
  }
}


