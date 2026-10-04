import { SafeError } from '../utils/errors.js';
import { GoogleDriveClient } from '../integrations/googleDriveClient.js';
import type { LinkedInClient } from './linkedinClient.js';

export type MediaType = 'image' | 'video' | 'document';

interface InitImageResponse {
  value: { uploadUrl: string; image: string };
}
interface InitVideoResponse {
  value: {
    uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number; etag?: string }>;
    video: string;
    uploadToken?: string;
  };
}
interface InitDocumentResponse {
  value: { uploadUrl: string; document: string };
}

async function downloadMedia(
  url: string,
  fetchFn: typeof fetch,
  driveClient?: GoogleDriveClient,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (GoogleDriveClient.isGoogleDriveUrl(url)) {
    if (!driveClient) throw new SafeError('GOOGLE_DRIVE_CLIENT_NOT_CONFIGURED');
    const fileId = GoogleDriveClient.extractFileId(url);
    if (!fileId) throw new SafeError('GOOGLE_DRIVE_INVALID_URL');
    return driveClient.downloadFile(fileId);
  }
  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
      throw new SafeError('MEDIA_DOWNLOAD_TIMEOUT');
    }
    throw new SafeError('MEDIA_DOWNLOAD_FAILED');
  }
  if (!response.ok) throw new SafeError(`MEDIA_DOWNLOAD_HTTP_${response.status}`);
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

async function putBinary(uploadUrl: string, buffer: Buffer, contentType: string, fetchFn: typeof fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchFn(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer as BodyInit,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
      throw new SafeError('MEDIA_UPLOAD_TIMEOUT');
    }
    throw new SafeError('MEDIA_UPLOAD_FAILED');
  }
  if (!response.ok) throw new SafeError(`MEDIA_UPLOAD_HTTP_${response.status}`);
}

export async function uploadImage(
  mediaUrl: string,
  memberUrn: string,
  client: LinkedInClient,
  fetchFn: typeof fetch = fetch,
  driveClient?: GoogleDriveClient,
): Promise<string> {
  const { buffer, contentType } = await downloadMedia(mediaUrl, fetchFn, driveClient);

  const init = await client.request<InitImageResponse>(
    'POST',
    '/rest/images?action=initializeUpload',
    { initializeUploadRequest: { owner: memberUrn } },
  );
  await putBinary(init.value.uploadUrl, buffer, contentType, fetchFn);
  return init.value.image;
}

export async function uploadDocument(
  mediaUrl: string,
  memberUrn: string,
  client: LinkedInClient,
  fetchFn: typeof fetch = fetch,
  driveClient?: GoogleDriveClient,
): Promise<string> {
  const { buffer, contentType } = await downloadMedia(mediaUrl, fetchFn, driveClient);

  const init = await client.request<InitDocumentResponse>(
    'POST',
    '/rest/documents?action=initializeUpload',
    { initializeUploadRequest: { owner: memberUrn } },
  );
  await putBinary(init.value.uploadUrl, buffer, contentType, fetchFn);
  return init.value.document;
}

export async function uploadVideo(
  mediaUrl: string,
  memberUrn: string,
  client: LinkedInClient,
  fetchFn: typeof fetch = fetch,
  driveClient?: GoogleDriveClient,
): Promise<string> {
  const { buffer, contentType } = await downloadMedia(mediaUrl, fetchFn, driveClient);

  const init = await client.request<InitVideoResponse>(
    'POST',
    '/rest/videos?action=initializeUpload',
    {
      initializeUploadRequest: {
        owner: memberUrn,
        fileSizeBytes: buffer.byteLength,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
  );
  const { uploadInstructions, video: videoUrn, uploadToken } = init.value;

  const uploadedPartIds: string[] = [];
  for (const instruction of uploadInstructions) {
    const chunk = buffer.subarray(instruction.firstByte, instruction.lastByte + 1);
    await putBinary(instruction.uploadUrl, chunk, contentType, fetchFn);
    if (instruction.etag) uploadedPartIds.push(instruction.etag);
  }

  await client.request('POST', '/rest/videos?action=finalizeUpload', {
    finalizeUploadRequest: { video: videoUrn, uploadToken: uploadToken ?? '', uploadedPartIds },
  });

  await waitForVideoAvailable(videoUrn, client);
  return videoUrn;
}

async function waitForVideoAvailable(videoUrn: string, client: LinkedInClient, maxWaitMs = 120_000): Promise<void> {
  const encoded = encodeURIComponent(videoUrn);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5_000));
    const video = await client.request<{ status: string }>('GET', `/rest/videos/${encoded}`);
    if (video.status === 'AVAILABLE') return;
    if (video.status === 'FAILED') throw new SafeError('LINKEDIN_VIDEO_PROCESSING_FAILED');
  }
  throw new SafeError('LINKEDIN_VIDEO_PROCESSING_TIMEOUT');
}

/** Selects the upload function and returns the asset URN. */
export async function uploadMediaAsset(
  mediaUrl: string,
  mediaType: MediaType,
  memberUrn: string,
  client: LinkedInClient,
  fetchFn: typeof fetch = fetch,
  driveClient?: GoogleDriveClient,
): Promise<string> {
  switch (mediaType) {
    case 'image': return uploadImage(mediaUrl, memberUrn, client, fetchFn, driveClient);
    case 'video': return uploadVideo(mediaUrl, memberUrn, client, fetchFn, driveClient);
    case 'document': return uploadDocument(mediaUrl, memberUrn, client, fetchFn, driveClient);
  }
}

/** Maps a Notion format string to a MediaType, or null for text-only. */
export function notionFormatToMediaType(format: string): MediaType | null {
  switch (format) {
    case 'Texto + imagem':
    case 'Imagem vertical':
      return 'image';
    case 'Vídeo/GIF':
      return 'video';
    case 'Documento':
      return 'document';
    default:
      return null;
  }
}
