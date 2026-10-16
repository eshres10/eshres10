import { requestUploadUrl } from '@workspace/api-client-react';

export type UploadPurpose = 'image' | 'avatar' | 'pattern_pdf';

/**
 * Downscales an image in the browser before upload (longest side <= maxPx) and
 * re-encodes it as WebP. Re-encoding through a canvas drops EXIF metadata,
 * including GPS location. GIFs and anything the browser can't decode are
 * returned unchanged; the server resizes again in a later phase.
 */
export async function prepareImage(file: File, maxPx = 1600): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  }
}

/**
 * Uploads a file to private object storage and returns its /api/storage URL.
 * Images are downscaled first. The server records you as the owner, and only
 * serves the file to people the access rules allow.
 */
export async function uploadFile(file: File, purpose: UploadPurpose = 'image'): Promise<{ url: string; file: File }> {
  const prepared = purpose === 'pattern_pdf' ? file : await prepareImage(file, purpose === 'avatar' ? 512 : 1600);
  const result = await requestUploadUrl({ name: prepared.name, size: prepared.size, contentType: prepared.type, purpose });
  const uploaded = await fetch(result.uploadURL, { method: 'PUT', headers: { 'Content-Type': prepared.type }, body: prepared });
  if (!uploaded.ok) throw new Error('The upload did not complete. Check your connection and try again.');
  return { url: `/api/storage/objects/${result.objectPath.replace(/^\/objects\//, '')}`, file: prepared };
}
