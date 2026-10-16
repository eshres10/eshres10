import { getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SIGNED_OUT, viewerFor, type Viewer } from "../access";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewer?: Viewer;
    }
  }
}

/** Finds the signed-in user id for a request, or null. */
export type UserIdResolver = (req: Request) => string | null;

export const clerkUserId: UserIdResolver = (req) => getAuth(req)?.userId ?? null;

/** Sets req.viewer for every request (signed in or not). */
export function attachViewer(resolve: UserIdResolver): RequestHandler {
  return (req, _res, next) => {
    req.viewer = viewerFor(resolve(req));
    next();
  };
}

export function viewerOf(req: Request): Viewer {
  return req.viewer ?? SIGNED_OUT;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!viewerOf(req).userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** The signed-in user id. Only call behind requireAuth. */
export function getUserId(req: Request): string {
  const id = viewerOf(req).userId;
  if (!id) throw new Error("getUserId called without requireAuth");
  return id;
}
