import { Router, type IRouter } from "express";
import { GetUnreadNotificationCountResponse, ListNotificationsQueryParams, ListNotificationsResponse, MarkNotificationsReadBody, MarkNotificationsReadResponse } from "@workspace/api-zod";
import { listNotifications, markNotificationsRead, unreadNotificationCount } from "../access";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Notifications (the bell): only ever the caller's own. Rows are written by
// database triggers, so there is nothing here to create or delete one.
const router: IRouter = Router();

router.use("/notifications", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.get("/notifications", scoped(async (req, res, db): Promise<void> => {
  const query = ListNotificationsQueryParams.safeParse(req.query);
  res.json(ListNotificationsResponse.parse(await listNotifications(db, viewerOf(req), query.success ? query.data.cursor : undefined)));
}));

router.get("/notifications/unread-count", scoped(async (req, res, db): Promise<void> => {
  res.json(GetUnreadNotificationCountResponse.parse({ unreadCount: await unreadNotificationCount(db, viewerOf(req)) }));
}));

router.post("/notifications/read", scoped(async (req, res, db): Promise<void> => {
  const body = MarkNotificationsReadBody.safeParse(req.body ?? {});
  if (!body.success) return void res.status(400).json({ error: "Send a list of up to 100 notification ids, or none for all." });
  const unreadCount = await markNotificationsRead(db, viewerOf(req), body.data.ids);
  res.json(MarkNotificationsReadResponse.parse({ unreadCount }));
}));

export default router;
