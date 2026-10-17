import { and, desc, eq, gt } from "drizzle-orm";
import {
  catalogSavesTable,
  catalogTable,
  fabricsTable,
  measurementProfilesTable,
  patternsTable,
  profilesTable,
  projectsTable,
  type Tx,
} from "@workspace/db";
import { sizeChart, type CatalogSizeView } from "./catalog";
import { own } from "./studio";
import type { Viewer } from "./viewer";

// Phase P4: a pattern page's private extras for the signed-in caller only. Read
// in their own transaction, so RLS keeps it to their rows too. Measurements are
// read here to pick a size and never leave the server: only the label does.

/** Pattern sales haven't opened, so nobody owns a pattern bought on Seams Club. */
export const PATTERN_SALES_OPEN = false;

export interface FabricNeeded { minMetres: number; maxMetres: number }
export interface StashMatch { id: number; name: string; type: string; imageUrl: string | null; metres: number; enough: "all" | "some" }
export interface CatalogMe {
  saved: boolean;
  owned: boolean;
  libraryPatternId: number | null;
  made: Array<{ id: number; name: string; status: string }>;
  closestSize: string | null;
  nearSizes: string[];
  hasMeasurements: boolean;
  fabricNeeded: FabricNeeded | null;
  stash: StashMatch[];
}

const YARD = 0.9144;
const STASH_SHOWN = 6;

/**
 * Fabric needed from the page's free text: "2.6–3.4 m", "3 yards", "2,5 m".
 * Needs a unit (m or yd): without one it's left unread rather than guessed.
 */
export function parseFabricNeeded(text: string | null | undefined): FabricNeeded | null {
  if (!text) return null;
  const numbers = [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", "."))).filter((n) => n > 0 && n < 50);
  if (!numbers.length) return null;
  const yards = /\b(yd|yds|yard|yards)\b/i.test(text);
  const metres = /\d\s*m\b|\b(m|metre|metres|meter|meters)\b/i.test(text);
  if (yards === metres) return null;
  const k = yards ? YARD : 1;
  return { minMetres: Math.min(...numbers) * k, maxMetres: Math.max(...numbers) * k };
}

/** Metres in a stash amount, reading the unit loosely (as the studio does). */
function toMetres(quantity: number, unit: string | null): number {
  return /^y/i.test(unit ?? "") ? quantity * YARD : quantity;
}

type Body = { bust: number | null; waist: number | null; hip: number | null };

/** The body measurements a size chart compares, in cm, from a saved set. */
export function bodyFrom(values: Record<string, number>, units: string): Body {
  const k = units === "imperial" ? 2.54 : 1;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const v = values[key];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v * k;
    }
    return null;
  };
  return { bust: pick("bust"), waist: pick("waist"), hip: pick("fullHip", "hip", "hips") };
}

/** The chart size nearest these measurements (mean squared difference over the shared ones). */
export function closestSize(sizes: CatalogSizeView[], body: Body): string | null {
  let best: { label: string; score: number } | null = null;
  for (const s of sizes) {
    const pairs = ([[s.bustCm, body.bust], [s.waistCm, body.waist], [s.hipCm, body.hip]] as const)
      .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
    if (!pairs.length) continue;
    const score = pairs.reduce((sum, [a, b]) => sum + (a - b) ** 2, 0) / pairs.length;
    if (!best || score < best.score) best = { label: s.label, score };
  }
  return best?.label ?? null;
}

export async function catalogMe(db: Tx, viewer: Viewer, catalogId: number): Promise<CatalogMe | null> {
  const me = viewer.userId;
  if (!me) return null;
  const [entry] = await db.select().from(catalogTable).where(eq(catalogTable.id, catalogId));
  if (!entry) return null;

  const [saved] = await db.select({ id: catalogSavesTable.catalogId }).from(catalogSavesTable)
    .where(and(eq(catalogSavesTable.userId, me), eq(catalogSavesTable.catalogId, catalogId)));
  const [library] = await db.select({ id: patternsTable.id }).from(patternsTable)
    .where(and(own(patternsTable, viewer), eq(patternsTable.catalogId, catalogId))).orderBy(patternsTable.id).limit(1);
  const made = await db.select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status })
    .from(projectsTable)
    .innerJoin(patternsTable, and(eq(patternsTable.id, projectsTable.patternId), eq(patternsTable.userId, projectsTable.userId)))
    .where(and(own(projectsTable, viewer), eq(patternsTable.catalogId, catalogId)))
    .orderBy(desc(projectsTable.id));

  // Closest size: your latest saved set against the chart. Only the label leaves.
  const sizes = entry.kind === "pattern" ? await sizeChart(db, catalogId) : [];
  const [latest] = await db.select({ values: measurementProfilesTable.measurements }).from(measurementProfilesTable)
    .where(own(measurementProfilesTable, viewer))
    .orderBy(desc(measurementProfilesTable.recordedAt), desc(measurementProfilesTable.id)).limit(1);
  const [profile] = await db.select({ units: profilesTable.units }).from(profilesTable).where(eq(profilesTable.userId, me));
  const closest = latest && sizes.length ? closestSize(sizes, bodyFrom(latest.values, profile?.units ?? "metric")) : null;
  const at = closest === null ? -1 : sizes.findIndex((s) => s.label === closest);
  const nearSizes = at < 0 ? [] : sizes.slice(Math.max(0, at - 1), at + 2).map((s) => s.label);

  // In your stash: your own fabric with enough length for this pattern.
  const fabricNeeded = entry.kind === "pattern" ? parseFabricNeeded(entry.yardage) : null;
  let stash: StashMatch[] = [];
  if (fabricNeeded) {
    const fabrics = await db.select().from(fabricsTable).where(and(own(fabricsTable, viewer), gt(fabricsTable.quantity, 0)));
    stash = fabrics
      .map((f) => ({ f, metres: toMetres(f.quantity!, f.unit) }))
      .filter(({ metres }) => metres >= fabricNeeded.minMetres - 0.05)
      .map(({ f, metres }): StashMatch => ({
        id: f.id, name: f.name, type: f.type, imageUrl: f.imageUrl, metres: Math.round(metres * 100) / 100,
        enough: metres >= fabricNeeded.maxMetres - 0.05 ? "all" : "some",
      }))
      .sort((a, b) => (a.enough === b.enough ? b.metres - a.metres : a.enough === "all" ? -1 : 1))
      .slice(0, STASH_SHOWN);
  }

  return {
    saved: Boolean(saved),
    owned: false, // nothing is sold on Seams Club yet (PATTERN_SALES_OPEN)
    libraryPatternId: library?.id ?? null,
    made,
    closestSize: closest,
    nearSizes,
    hasMeasurements: Boolean(latest),
    fabricNeeded: fabricNeeded && { minMetres: Math.round(fabricNeeded.minMetres * 100) / 100, maxMetres: Math.round(fabricNeeded.maxMetres * 100) / 100 },
    stash,
  };
}
