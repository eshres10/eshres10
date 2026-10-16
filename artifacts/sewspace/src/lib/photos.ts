import { createMedia, type Media } from '@workspace/api-client-react';
import { uploadFile } from '@/lib/upload';

/** Upload a photo (downscaled in the browser), then have the server resize it and strip metadata. */
export async function processPhoto(file: File): Promise<Media> {
  const { url } = await uploadFile(file, 'image');
  return createMedia({ objectPath: url.replace(/^\/api\/storage/, '') });
}
