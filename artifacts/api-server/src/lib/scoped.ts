import type { Request, Response } from "express";
import { withUser, type Tx } from "@workspace/db";
import { viewerOf } from "../middlewares/auth";

// The subset of Express's Response that scoped handlers use. Calls are recorded
// and only sent once the handler's transaction has committed, so a client never
// sees a success response for a write that was rolled back.
export interface Reply {
  status(code: number): Reply;
  json(body: unknown): void;
  sendStatus(code: number): void;
}

type ScopedHandler = (req: Request, res: Reply, db: Tx) => Promise<void>;

// Runs a route handler inside withUser(), so every query it makes through `db`
// is checked by the database's row-level security policies for the caller.
export function scoped(handler: ScopedHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    const out: { status: number; sent: "none" | "json" | "status"; body?: unknown } = { status: 200, sent: "none" };
    const reply: Reply = {
      status(code) {
        out.status = code;
        return reply;
      },
      json(body) {
        out.sent = "json";
        out.body = body;
      },
      sendStatus(code) {
        out.status = code;
        out.sent = "status";
      },
    };
    await withUser(viewerOf(req).userId, (db) => handler(req, reply, db));
    if (out.sent === "none") throw new Error(`${req.method} ${req.path} finished without a response`);
    if (out.sent === "status") res.sendStatus(out.status);
    else res.status(out.status).json(out.body);
  };
}
