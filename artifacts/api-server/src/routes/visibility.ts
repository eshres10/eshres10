import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { fabricsTable, patternsTable, projectsTable, threadsTable } from "@workspace/db";
import { SetVisibilityBody, SetVisibilityParams, SetVisibilityResponse } from "@workspace/api-zod";
import { own, publishedAtFor } from "../access";
import { viewerOf } from "../middlewares/auth";
import { scoped } from "../lib/scoped";

const router: IRouter = Router();

const TABLES = {
  project: projectsTable,
  fabric: fabricsTable,
  thread: threadsTable,
  pattern: patternsTable,
} as const;

// Change who can see one of your own items. Measurements have no visibility:
// they are never shared.
router.put("/visibility/:kind/:id", scoped(async (req, res, db): Promise<void> => {
  const params = SetVisibilityParams.safeParse(req.params);
  const body = SetVisibilityBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose public, followers or private." });
    return;
  }
  const viewer = viewerOf(req);
  const { kind, id } = params.data;
  const { visibility } = body.data;

  if (kind === "project") {
    const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), own(projectsTable, viewer)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(projectsTable)
      .set({ visibility, publishedAt: publishedAtFor(existing, visibility) })
      .where(and(eq(projectsTable.id, id), own(projectsTable, viewer)));
  } else {
    const table = TABLES[kind];
    const updated = await db
      .update(table)
      .set({ visibility })
      .where(and(eq(table.id, id), own(table, viewer)))
      .returning({ id: table.id });
    if (!updated.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }
  res.json(SetVisibilityResponse.parse({ kind, id, visibility }));
}));

export default router;
