import { createMedia, type Media } from '@workspace/api-client-react';
import { uploadFile, type UploadOptions } from '@/lib/upload';

/** Upload a photo (downscaled in the browser), then have the server resize it and strip metadata. */
export async function processPhoto(file: File, options: UploadOptions = {}): Promise<Media> {
  const { url } = await uploadFile(file, 'image', options);
  return createMedia({ objectPath: url.replace(/^\/api\/storage/, '') }, { signal: options.signal });
}
