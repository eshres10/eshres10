import { requestUploadUrl } from '@workspace/api-client-react';

export type UploadPurpose = 'image' | 'avatar' | 'pattern_pdf';

// Files already downscaled and re-encoded in the browser (the photo cropper),
// so uploading doesn't decode and re-encode them a second time.
const prepared = new WeakSet<File>();
export function markPrepared(file: File): File {
  prepared.add(file);
  return file;
}

/**
 * Downscales an image in the browser before upload (longest side <= maxPx) and
 * re-encodes it as WebP. Re-encoding through a canvas drops EXIF metadata,
 * including GPS location. GIFs and anything the browser can't decode are
 * returned unchanged; the server resizes again in a later phase.
 */
export async function prepareImage(file: File, maxPx = 1600): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || prepared.has(file)) return file;
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

export interface UploadOptions {
  /** 0..1 as the bytes go up. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** PUT to a presigned URL with XHR, which (unlike fetch) reports upload progress. */
function putWithProgress(url: string, body: File, { onProgress, signal }: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', body.type);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The upload did not complete. Check your connection and try again.')));
    xhr.onerror = () => reject(new Error('The upload did not complete. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (signal) {
      if (signal.aborted) return xhr.abort();
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

/**
 * Uploads a file to private object storage and returns its /api/storage URL.
 * Images are downscaled first. The server records you as the owner, and only
 * serves the file to people the access rules allow.
 */
export async function uploadFile(file: File, purpose: UploadPurpose = 'image', options: UploadOptions = {}): Promise<{ url: string; file: File }> {
  const prepared = purpose === 'pattern_pdf' ? file : await prepareImage(file, purpose === 'avatar' ? 512 : 1600);
  options.signal?.throwIfAborted();
  const result = await requestUploadUrl({ name: prepared.name, size: prepared.size, contentType: prepared.type, purpose }, { signal: options.signal });
  await putWithProgress(result.uploadURL, prepared, options);
  return { url: `/api/storage/objects/${result.objectPath.replace(/^\/objects\//, '')}`, file: prepared };
}
