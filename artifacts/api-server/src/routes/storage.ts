import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { uploadsTable, withUser } from '@workspace/db';

import { canReadObject } from '../access';
import { getUserId, viewerOf } from '../middlewares/auth';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const defaultStorage = new ObjectStorageService();

// Tests swap in a fake via app.locals.objectStorage; production uses Replit Object Storage.
function storageFor(req: Request): ObjectStorageService {
  return (req.app.locals.objectStorage as ObjectStorageService | undefined) ?? defaultStorage;
}

async function pipeObject(res: Response, response: globalThis.Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.body) {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } else {
    res.end();
  }
}

/**
 * Routes that read stored files. Mounted before sign-in is required, because
 * public avatars (and later, public post photos) must load for signed-out
 * visitors. Every request is checked by the access module.
 */
export const objectReadRouter: IRouter = Router();

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
objectReadRouter.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await storageFor(req).searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      await pipeObject(res, await storageFor(req).downloadObject(file));
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve an uploaded object only when the access module says the caller may see
 * it (their own upload, a public avatar, or a legacy file referenced by a row
 * they own). Anything else is a 404, so other people's files are not revealed.
 */
objectReadRouter.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const viewer = viewerOf(req);
    const allowed = await withUser(viewer.userId, (db) => canReadObject(db, viewer, objectPath));
    if (!allowed) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const storage = storageFor(req);
    const objectFile = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(objectFile);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // downloadObject sends Cache-Control: private (no object ACLs are set), so
    // shared caches never keep these files.
    await pipeObject(res, response);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

const router: IRouter = Router();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload. The client sends JSON metadata
 * (name, size, contentType, purpose) — not the file — then uploads directly to
 * the returned URL. The owner is recorded first; only recorded objects are served.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const isPdf = contentType === 'application/pdf' && name.toLowerCase().endsWith('.pdf');
      const isImage = /^image\/(jpeg|png|webp|gif)$/.test(contentType);
      const maxSize = isPdf ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      const purpose = parsed.data.purpose ?? (isPdf ? 'pattern_pdf' : 'image');

      if (!isPdf && !isImage) {
        res.status(415).json({ error: 'Only PDF, JPEG, PNG, WebP, and GIF files are supported' });
        return;
      }
      if ((purpose === 'pattern_pdf') !== isPdf) {
        res.status(415).json({ error: purpose === 'pattern_pdf' ? 'Pattern files must be PDFs' : 'Choose an image file' });
        return;
      }
      if (size <= 0 || size > maxSize) {
        res.status(413).json({
          error: isPdf ? 'Pattern PDFs must be 50 MB or smaller' : 'Images must be 10 MB or smaller',
        });
        return;
      }

      const storage = storageFor(req);
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);
      const userId = getUserId(req);
      await withUser(userId, (db) =>
        db.insert(uploadsTable).values({ objectPath, userId, contentType, sizeBytes: size, purpose }),
      );

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

export default router;
