import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { createSeoRouter, type SeoOptions } from "./routes/seo";
import { logger } from "./lib/logger";
import { attachViewer, clerkUserId, type UserIdResolver } from "./middlewares/auth";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

export interface AppOptions {
  /**
   * Test harness only: resolve the signed-in user from this function instead of
   * Clerk. Never set in src/index.ts.
   */
  testUserId?: UserIdResolver;
  seo?: SeoOptions;
}

// Postgres errors that mean "row-level security refused this". They only happen
// when a request tries to touch rows it can't see, so they read as not found.
const RLS_DENIED = new Set(["42501"]);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  if (code && RLS_DENIED.has(code)) {
    req.log?.warn({ err }, "Blocked by row-level security");
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Body parser refusals (too large, bad JSON) keep their own 4xx status.
  const status = (err as { status?: number; type?: string }).status;
  if ((err as { type?: string }).type && status && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? "That's too large to send." : "That request couldn't be read." });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  if (!res.headersSent) res.status(500).json({ error: "Something went wrong" });
};

export function createApp(options: AppOptions = {}): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  if (!options.testUserId) app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
  app.use(cors({ credentials: true, origin: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (options.testUserId) {
    app.use(attachViewer(options.testUserId));
  } else {
    app.use(
      clerkMiddleware((req) => ({
        publishableKey: publishableKeyFromHost(
          getClerkProxyHost(req) ?? "",
          process.env.CLERK_PUBLISHABLE_KEY,
        ),
      })),
    );
    app.use(attachViewer(clerkUserId));
  }

  app.use(createSeoRouter(options.seo));
  app.use("/api", router);
  app.use(errorHandler);

  return app;
}
