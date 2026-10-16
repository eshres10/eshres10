import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Viewer } from "./viewer";

// Filter for the viewer's own studio rows (stash, patterns, projects,
// measurements). Throws for signed-out viewers: studio routes require sign-in.
export function own(table: { userId: PgColumn }, viewer: Viewer): SQL {
  if (!viewer.userId) throw new Error("own() needs a signed-in viewer");
  return eq(table.userId, viewer.userId);
}
