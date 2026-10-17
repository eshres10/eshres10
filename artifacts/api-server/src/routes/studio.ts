import { and, asc, desc, eq, ilike, ne, or } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { withUser, type Tx } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import {
  fabricsTable,
  measurementProfilesTable,
  patternsTable,
  profilesTable,
  projectPhotosTable,
  projectStepsTable,
  projectsTable,
  threadsTable,
  uploadsTable,
} from "@workspace/db";
import {
  AskAssistantBody,
  AskAssistantResponse,
  AnalyzePatternPdfBody,
  AnalyzePatternPdfResponse,
  CreateFabricBody,
  CreateFabricResponse,
  CreateMeasurementProfileBody,
  CreateMeasurementProfileResponse,
  CreatePatternBody,
  CreatePatternResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateProjectPhotoBody,
  CreateProjectPhotoParams,
  CreateProjectPhotoResponse,
  CreateProjectStepBody,
  CreateProjectStepParams,
  CreateProjectStepResponse,
  CreateThreadBody,
  CreateThreadResponse,
  CreateVisualizationBody,
  CreateVisualizationResponse,
  DeleteFabricParams,
  DeleteMeasurementProfileParams,
  DeletePatternParams,
  DeleteProjectParams,
  DeleteProjectPhotoParams,
  DeleteProjectStepParams,
  DeleteThreadParams,
  GetDashboardResponse,
  GetProfileResponse,
  GetProjectParams,
  GetProjectResponse,
  GetRecommendationsResponse,
  ListFabricsQueryParams,
  ListFabricsResponse,
  ListMeasurementProfilesResponse,
  ListPatternsQueryParams,
  ListPatternsResponse,
  ListProjectsResponse,
  ListThreadsQueryParams,
  ListThreadsResponse,
  UpdateFabricBody,
  UpdateFabricParams,
  UpdateFabricResponse,
  UpdateMeasurementProfileBody,
  UpdateMeasurementProfileParams,
  UpdateMeasurementProfileResponse,
  UpdatePatternBody,
  UpdatePatternParams,
  UpdatePatternResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  UpdateProjectBody,
  UpdateProjectFieldsBody,
  UpdateProjectFieldsParams,
  UpdateProjectFieldsResponse,
  AddStepsFromPatternParams,
  AddStepsFromPatternResponse,
  UpdateProjectParams,
  UpdateProjectResponse,
  UpdateProjectPhotoBody,
  UpdateProjectPhotoParams,
  UpdateProjectPhotoResponse,
  UpdateProjectStepBody,
  UpdateProjectStepParams,
  UpdateProjectStepResponse,
  UpdateThreadBody,
  UpdateThreadParams,
  UpdateThreadResponse,
} from "@workspace/api-zod";
import { getUserId } from "../middlewares/auth";
import { scoped, type Reply } from "../lib/scoped";
import { sequence } from "../lib/sequence";
import { ensureProfile } from "./profile";
import { findForeignObjectField, IMAGE_FIELD, PDF_FIELD, publishedAtFor, type UploadPurpose } from "../access";
import { viewerOf } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function userId(req: Request): string {
  return getUserId(req);
}

function cleanSearch(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateString(value: Date | string | null | undefined): string | null | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

const FOREIGN_FILE_ERROR = "That file isn't one of your uploads. Upload it again.";

// Rejects a create/update that points a file field at an object the caller
// didn't upload (or at an external URL). Unchanged stored values are allowed.
async function rejectsForeignFiles(
  db: Tx,
  req: Request,
  res: Reply,
  values: Record<string, unknown>,
  fields: Record<string, readonly UploadPurpose[]>,
  existing?: Record<string, unknown> | null,
): Promise<boolean> {
  const field = await findForeignObjectField(db, viewerOf(req), values, fields, existing);
  if (!field) return false;
  res.status(400).json({ error: FOREIGN_FILE_ERROR });
  return true;
}

function fabricResponse(row: typeof fabricsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    width: row.width,
    quantity: row.quantity,
    unit: row.unit,
    composition: row.composition,
    stretch: row.stretch,
    weight: row.weight,
    notes: row.notes,
    imageUrl: row.imageUrl,
    colorHex: row.colorHex,
    visibility: row.visibility,
    isDemo: row.isDemo,
    catalogId: row.catalogId,
  };
}

function threadResponse(row: typeof threadsTable.$inferSelect) {
  return {
    id: row.id,
    brand: row.brand,
    color: row.color,
    colorName: row.colorName,
    type: row.type,
    weight: row.weight,
    quantity: row.quantity,
    notes: row.notes,
    imageUrl: row.imageUrl,
    visibility: row.visibility,
    isDemo: row.isDemo,
    catalogId: row.catalogId,
  };
}

function patternResponse(row: typeof patternsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    designer: row.designer,
    garmentType: row.garmentType,
    difficulty: row.difficulty,
    sizes: row.sizes,
    requiredFabric: row.requiredFabric,
    yardage: row.yardage,
    recommendedFabrics: row.recommendedFabrics,
    seamAllowance: row.seamAllowance,
    instructions: row.instructions,
    notes: row.notes,
    coverImageUrl: row.coverImageUrl,
    pdfUrl: row.pdfUrl,
    pdfFileName: row.pdfFileName,
    status: row.status,
    visibility: row.visibility,
    isDemo: row.isDemo,
    catalogId: row.catalogId,
    steps: row.steps ?? null,
    format: row.format ?? null,
  };
}

function projectResponse(row: typeof projectsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    progress: row.progress,
    patternId: row.patternId,
    fabricId: row.fabricId,
    threadId: row.threadId,
    measurementProfileId: row.measurementProfileId,
    coverImageUrl: row.coverImageUrl,
    description: row.description,
    notes: row.notes,
    alterations: row.alterations,
    problems: row.problems,
    solutions: row.solutions,
    completedAt: row.completedAt,
    visibility: row.visibility,
    size: row.size,
    publishedAt: row.publishedAt,
    isDemo: row.isDemo,
    garment: row.garment,
    setup: {
      dismissed: row.setup?.dismissed ?? false,
      visibilityChosen: row.setup?.visibilityChosen ?? false,
      stepsChoice: row.setup?.stepsChoice ?? null,
    },
  };
}

function projectStepResponse(row: typeof projectStepsTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    notes: row.notes,
    position: row.position,
    completed: row.completed,
    completedAt: row.completedAt,
  };
}

function projectPhotoResponse(row: typeof projectPhotosTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    url: row.url,
    caption: row.caption,
    fileName: row.fileName,
    position: row.position,
    createdAt: row.createdAt,
  };
}

async function recalculateProjectProgress(db: Tx, projectId: number, uid: string): Promise<void> {
  const steps = await db
    .select({ completed: projectStepsTable.completed })
    .from(projectStepsTable)
    .where(and(eq(projectStepsTable.projectId, projectId), eq(projectStepsTable.userId, uid)));
  // Progress is derived from steps: completed ÷ total (0 with no steps).
  if (steps.length === 0) {
    await db.update(projectsTable).set({ progress: 0 }).where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, uid)));
    return;
  }

  const progress = Math.round((steps.filter((step) => step.completed).length / steps.length) * 100);
  const values: {
    progress: number;
    status?: string;
    completedAt?: string;
  } = { progress };
  if (progress === 100) {
    values.status = "finished";
    values.completedAt = new Date().toISOString().slice(0, 10);
  }
  await db
    .update(projectsTable)
    .set(values)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, uid)));
}

function measurementResponse(row: typeof measurementProfilesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    recordedAt: row.recordedAt,
    notes: row.notes,
    measurements: row.measurements,
  };
}

router.get("/dashboard", scoped(async (req, res, db): Promise<void> => {
  const uid = userId(req);
  await ensureProfile(db, uid);
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, uid));
  const [fabrics, threads, patterns, projects, recentFabrics, recentPatterns] = await sequence([
    () => db.select({ id: fabricsTable.id }).from(fabricsTable).where(eq(fabricsTable.userId, uid)),
    () => db.select({ id: threadsTable.id }).from(threadsTable).where(eq(threadsTable.userId, uid)),
    () => db.select({ id: patternsTable.id }).from(patternsTable).where(eq(patternsTable.userId, uid)),
    () => db.select().from(projectsTable).where(and(eq(projectsTable.userId, uid), ne(projectsTable.status, "finished"))).orderBy(asc(projectsTable.id)),
    () => db.select().from(fabricsTable).where(eq(fabricsTable.userId, uid)).orderBy(desc(fabricsTable.createdAt)).limit(3),
    () => db.select().from(patternsTable).where(eq(patternsTable.userId, uid)).orderBy(desc(patternsTable.createdAt)).limit(3),
  ]);
  res.json(
    GetDashboardResponse.parse({
      userName: profile.name,
      fabricCount: fabrics.length,
      threadCount: threads.length,
      patternCount: patterns.length,
      projectCount: (await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.userId, uid))).length,
      activeProject: projects[0] ? projectResponse(projects[0]) : null,
      recentFabrics: recentFabrics.map(fabricResponse),
      recentPatterns: recentPatterns.map(patternResponse),
    }),
  );
}));

router.get("/fabrics", scoped(async (req, res, db): Promise<void> => {
  const parsed = ListFabricsQueryParams.safeParse(req.query);
  const search = cleanSearch(parsed.success ? parsed.data.search : undefined);
  const uid = userId(req);
  const rows = await db
    .select()
    .from(fabricsTable)
    .where(
      search
        ? and(eq(fabricsTable.userId, uid), or(ilike(fabricsTable.name, `%${search}%`), ilike(fabricsTable.type, `%${search}%`), ilike(fabricsTable.color, `%${search}%`)))
        : eq(fabricsTable.userId, uid),
    )
    .orderBy(desc(fabricsTable.createdAt));
  res.json(ListFabricsResponse.parse(rows.map(fabricResponse)));
}));

router.post("/fabrics", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreateFabricBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, parsed.data, { imageUrl: IMAGE_FIELD })) return;
  const [row] = await db.insert(fabricsTable).values({ ...parsed.data, userId: userId(req), isDemo: false }).returning();
  res.status(201).json(CreateFabricResponse.parse(fabricResponse(row)));
}));

router.patch("/fabrics/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateFabricParams.safeParse(req.params);
  const body = UpdateFabricBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid fabric data" });
    return;
  }
  const [existing] = await db.select().from(fabricsTable).where(and(eq(fabricsTable.id, params.data.id), eq(fabricsTable.userId, userId(req))));
  if (!existing) {
    res.status(404).json({ error: "Fabric not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { imageUrl: IMAGE_FIELD }, existing)) return;
  const [row] = await db.update(fabricsTable).set(body.data).where(and(eq(fabricsTable.id, params.data.id), eq(fabricsTable.userId, userId(req)))).returning();
  if (!row) {
    res.status(404).json({ error: "Fabric not found" });
    return;
  }
  res.json(UpdateFabricResponse.parse(fabricResponse(row)));
}));

router.delete("/fabrics/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteFabricParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(fabricsTable).where(and(eq(fabricsTable.id, params.data.id), eq(fabricsTable.userId, userId(req)))).returning({ id: fabricsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Fabric not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/threads", scoped(async (req, res, db): Promise<void> => {
  const parsed = ListThreadsQueryParams.safeParse(req.query);
  const search = cleanSearch(parsed.success ? parsed.data.search : undefined);
  const uid = userId(req);
  const rows = await db.select().from(threadsTable).where(search ? and(eq(threadsTable.userId, uid), or(ilike(threadsTable.colorName, `%${search}%`), ilike(threadsTable.brand, `%${search}%`))) : eq(threadsTable.userId, uid)).orderBy(desc(threadsTable.createdAt));
  res.json(ListThreadsResponse.parse(rows.map(threadResponse)));
}));

router.post("/threads", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreateThreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, parsed.data, { imageUrl: IMAGE_FIELD })) return;
  const [row] = await db.insert(threadsTable).values({ ...parsed.data, userId: userId(req), isDemo: false }).returning();
  res.status(201).json(CreateThreadResponse.parse(threadResponse(row)));
}));

router.patch("/threads/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateThreadParams.safeParse(req.params);
  const body = UpdateThreadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid thread data" });
    return;
  }
  const [existing] = await db.select().from(threadsTable).where(and(eq(threadsTable.id, params.data.id), eq(threadsTable.userId, userId(req))));
  if (!existing) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { imageUrl: IMAGE_FIELD }, existing)) return;
  const [row] = await db.update(threadsTable).set(body.data).where(and(eq(threadsTable.id, params.data.id), eq(threadsTable.userId, userId(req)))).returning();
  if (!row) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(UpdateThreadResponse.parse(threadResponse(row)));
}));

router.delete("/threads/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteThreadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(threadsTable).where(and(eq(threadsTable.id, params.data.id), eq(threadsTable.userId, userId(req)))).returning({ id: threadsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/patterns", scoped(async (req, res, db): Promise<void> => {
  const parsed = ListPatternsQueryParams.safeParse(req.query);
  const search = cleanSearch(parsed.success ? parsed.data.search : undefined);
  const uid = userId(req);
  const rows = await db.select().from(patternsTable).where(search ? and(eq(patternsTable.userId, uid), or(ilike(patternsTable.name, `%${search}%`), ilike(patternsTable.garmentType, `%${search}%`), ilike(patternsTable.designer, `%${search}%`))) : eq(patternsTable.userId, uid)).orderBy(desc(patternsTable.createdAt));
  res.json(ListPatternsResponse.parse(rows.map(patternResponse)));
}));

router.post("/patterns/analyze-pdf", async (req, res): Promise<void> => {
  const parsed = AnalyzePatternPdfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const match = parsed.data.pdfUrl.match(/^\/api\/storage(\/objects\/.+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid pattern PDF location" });
    return;
  }

  // Only analyse a PDF the caller uploaded as a pattern PDF.
  const foreign = await withUser(userId(req), (db) =>
    findForeignObjectField(db, viewerOf(req), { pdfUrl: parsed.data.pdfUrl }, { pdfUrl: PDF_FIELD }),
  );
  if (foreign) {
    res.status(404).json({ error: "Uploaded PDF not found" });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(match[1]);
    const [metadata] = await objectFile.getMetadata();
    if (metadata.contentType !== "application/pdf") {
      res.status(415).json({ error: "The uploaded file is not a PDF" });
      return;
    }
    if (Number(metadata.size || 0) > 50 * 1024 * 1024) {
      res.status(413).json({ error: "Pattern PDFs must be 50 MB or smaller" });
      return;
    }

    const [pdfBuffer] = await objectFile.download();
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      max_output_tokens: 4096,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: "sewing-pattern.pdf",
              file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
            },
            {
              type: "input_text",
              text: `Read this sewing pattern PDF and extract details for a pattern library form.

Rules:
- Use the pattern title, designer/company, garment type, size range, fabric requirements, fabric recommendations, seam allowance, and concise construction summary from the document.
- difficulty must be beginner, intermediate, advanced, or null. Infer it from the construction techniques only when the PDF does not state it.
- yardage must be one representative numeric amount when clear, otherwise null. Preserve the complete multi-size yardage information in requiredFabric or notes.
- Keep instructions concise: summarize major construction stages rather than reproducing copyrighted instructions.
- steps: when the PDF has construction instructions, list the main stages in order as short imperative phrases in your own words (at most 20, each under 80 characters, e.g. "Staystitch the neckline"); otherwise null.
- Return null for details that cannot be determined.`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sewing_pattern_details",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: ["string", "null"] },
              designer: { type: ["string", "null"] },
              garmentType: { type: ["string", "null"] },
              difficulty: {
                type: ["string", "null"],
                enum: ["beginner", "intermediate", "advanced", null],
              },
              sizes: { type: ["string", "null"] },
              requiredFabric: { type: ["string", "null"] },
              yardage: { type: ["number", "null"] },
              recommendedFabrics: { type: ["string", "null"] },
              seamAllowance: { type: ["string", "null"] },
              instructions: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
              steps: { type: ["array", "null"], items: { type: "string" } },
            },
            required: [
              "name", "designer", "garmentType", "difficulty", "sizes",
              "requiredFabric", "yardage", "recommendedFabrics",
              "seamAllowance", "instructions", "notes", "steps",
            ],
          },
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI returned no pattern details");
    }
    const details = JSON.parse(response.output_text);
    // Keep steps short and few, whatever the model returned.
    details.steps = Array.isArray(details.steps)
      ? details.steps.map((x: unknown) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 20)
      : null;
    if (details.steps && !details.steps.length) details.steps = null;
    res.json(AnalyzePatternPdfResponse.parse(details));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Uploaded PDF not found" });
      return;
    }
    req.log.error({ err: error }, "Pattern PDF analysis failed");
    res.status(502).json({ error: "The PDF uploaded, but its details could not be extracted" });
  }
});

router.post("/patterns", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreatePatternBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, parsed.data, { coverImageUrl: IMAGE_FIELD, pdfUrl: PDF_FIELD })) return;
  const [row] = await db.insert(patternsTable).values({ ...parsed.data, userId: userId(req), isDemo: false }).returning();
  res.status(201).json(CreatePatternResponse.parse(patternResponse(row)));
}));

router.patch("/patterns/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdatePatternParams.safeParse(req.params);
  const body = UpdatePatternBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid pattern data" });
    return;
  }
  const [existing] = await db.select().from(patternsTable).where(and(eq(patternsTable.id, params.data.id), eq(patternsTable.userId, userId(req))));
  if (!existing) {
    res.status(404).json({ error: "Pattern not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { coverImageUrl: IMAGE_FIELD, pdfUrl: PDF_FIELD }, existing)) return;
  const [row] = await db.update(patternsTable).set(body.data).where(and(eq(patternsTable.id, params.data.id), eq(patternsTable.userId, userId(req)))).returning();
  if (!row) {
    res.status(404).json({ error: "Pattern not found" });
    return;
  }
  res.json(UpdatePatternResponse.parse(patternResponse(row)));
}));

router.delete("/patterns/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeletePatternParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(patternsTable).where(and(eq(patternsTable.id, params.data.id), eq(patternsTable.userId, userId(req)))).returning({ id: patternsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Pattern not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/projects", scoped(async (req, res, db): Promise<void> => {
  const uid = userId(req);
  const rows = await db.select().from(projectsTable).where(eq(projectsTable.userId, uid)).orderBy(desc(projectsTable.createdAt));
  res.json(ListProjectsResponse.parse(rows.map(projectResponse)));
}));

router.post("/projects", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, parsed.data, { coverImageUrl: IMAGE_FIELD })) return;
  const [row] = await db
    .insert(projectsTable)
    .values({
      ...parsed.data,
      completedAt: dateString(parsed.data.completedAt),
      publishedAt: publishedAtFor(null, parsed.data.visibility),
      userId: userId(req),
      isDemo: false,
    })
    .returning();
  res.status(201).json(CreateProjectResponse.parse(projectResponse(row)));
}));

router.patch("/projects/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid project data" });
    return;
  }
  const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId(req))));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { coverImageUrl: IMAGE_FIELD }, existing)) return;
  const [row] = await db
    .update(projectsTable)
    .set({ ...body.data, completedAt: dateString(body.data.completedAt), publishedAt: publishedAtFor(existing, body.data.visibility) })
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId(req))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(projectResponse(row)));
}));

// The parts of a project the setup checklist, journal and stage picker
// change, one or a few at a time. Linked items must be the caller's own (RLS
// WITH CHECK says the same); setup flags merge into what's stored.
const LINKS = { patternId: patternsTable, fabricId: fabricsTable, threadId: threadsTable, measurementProfileId: measurementProfilesTable } as const;

router.patch("/projects/:id/fields", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateProjectFieldsParams.safeParse(req.params);
  const body = UpdateProjectFieldsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Check the project details and try again." });
    return;
  }
  const uid = userId(req);
  const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, uid)));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { setup, ...fields } = body.data;
  for (const [key, table] of Object.entries(LINKS) as Array<[keyof typeof LINKS, (typeof LINKS)[keyof typeof LINKS]]>) {
    const id = fields[key];
    if (id === undefined || id === null) continue;
    const [mine] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.userId, uid)));
    if (!mine) {
      res.status(400).json({ error: "You can only link your own patterns, fabrics, threads and measurements." });
      return;
    }
  }
  const values: Partial<typeof projectsTable.$inferInsert> = { ...fields, updatedAt: new Date() };
  for (const key of ["size", "garment", "notes", "alterations", "problems", "solutions"] as const) {
    const v = fields[key];
    if (typeof v === "string") values[key] = v.trim() === "" ? null : key === "size" || key === "garment" ? v.trim() : v;
  }
  if (fields.name !== undefined) values.name = fields.name.trim() || existing.name;
  if (fields.status === "finished" && !existing.completedAt) values.completedAt = new Date().toISOString().slice(0, 10);
  if (setup) values.setup = { ...existing.setup, ...Object.fromEntries(Object.entries(setup).filter(([, v]) => v !== undefined)) };
  const [row] = await db.update(projectsTable).set(values).where(and(eq(projectsTable.id, existing.id), eq(projectsTable.userId, uid))).returning();
  res.json(UpdateProjectFieldsResponse.parse(projectResponse(row)));
}));

// "Use the pattern's steps": copies the linked pattern's steps to the end of
// the project's list and records the choice.
router.post("/projects/:id/steps/from-pattern", scoped(async (req, res, db): Promise<void> => {
  const params = AddStepsFromPatternParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const uid = userId(req);
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [pattern] = project.patternId
    ? await db.select({ steps: patternsTable.steps }).from(patternsTable).where(and(eq(patternsTable.id, project.patternId), eq(patternsTable.userId, uid)))
    : [];
  const titles = (pattern?.steps ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (!titles.length) {
    res.status(400).json({ error: "This project's pattern has no steps yet." });
    return;
  }
  const [last] = await db.select({ position: projectStepsTable.position }).from(projectStepsTable)
    .where(and(eq(projectStepsTable.projectId, project.id), eq(projectStepsTable.userId, uid)))
    .orderBy(desc(projectStepsTable.position)).limit(1);
  const start = (last?.position ?? -1) + 1;
  const rows = await db.insert(projectStepsTable)
    .values(titles.map((title, i) => ({ projectId: project.id, userId: uid, title: title.slice(0, 200), position: start + i })))
    .returning();
  await db.update(projectsTable).set({ setup: { ...project.setup, stepsChoice: "pattern" } })
    .where(and(eq(projectsTable.id, project.id), eq(projectsTable.userId, uid)));
  await recalculateProjectProgress(db, project.id, uid);
  res.status(201).json(AddStepsFromPatternResponse.parse(rows.map(projectStepResponse)));
}));

router.delete("/projects/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(projectsTable).where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, userId(req)))).returning({ id: projectsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/projects/:id", scoped(async (req, res, db): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [steps, photos] = await sequence([
    () => db
      .select()
      .from(projectStepsTable)
      .where(and(eq(projectStepsTable.projectId, project.id), eq(projectStepsTable.userId, uid)))
      .orderBy(asc(projectStepsTable.position), asc(projectStepsTable.id)),
    () => db
      .select()
      .from(projectPhotosTable)
      .where(and(eq(projectPhotosTable.projectId, project.id), eq(projectPhotosTable.userId, uid)))
      .orderBy(asc(projectPhotosTable.position), asc(projectPhotosTable.id)),
  ]);
  res.json(
    GetProjectResponse.parse({
      ...projectResponse(project),
      steps: steps.map(projectStepResponse),
      photos: photos.map(projectPhotoResponse),
    }),
  );
}));

router.post("/projects/:projectId/steps", scoped(async (req, res, db): Promise<void> => {
  const params = CreateProjectStepParams.safeParse(req.params);
  const body = CreateProjectStepBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [step] = await db
    .insert(projectStepsTable)
    .values({
      ...body.data,
      projectId: project.id,
      userId: uid,
      completedAt: body.data.completed ? body.data.completedAt ?? new Date() : null,
    })
    .returning();
  await recalculateProjectProgress(db, project.id, uid);
  res.status(201).json(CreateProjectStepResponse.parse(projectStepResponse(step)));
}));

router.patch("/projects/:projectId/steps/:stepId", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateProjectStepParams.safeParse(req.params);
  const body = UpdateProjectStepBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const values = { ...body.data };
  if (body.data.completed === true && body.data.completedAt === undefined) {
    values.completedAt = new Date();
  } else if (body.data.completed === false && body.data.completedAt === undefined) {
    values.completedAt = null;
  }
  const [step] = await db
    .update(projectStepsTable)
    .set(values)
    .where(
      and(
        eq(projectStepsTable.id, params.data.stepId),
        eq(projectStepsTable.projectId, project.id),
        eq(projectStepsTable.userId, uid),
      ),
    )
    .returning();
  if (!step) {
    res.status(404).json({ error: "Project step not found" });
    return;
  }
  await recalculateProjectProgress(db, project.id, uid);
  res.json(UpdateProjectStepResponse.parse(projectStepResponse(step)));
}));

router.delete("/projects/:projectId/steps/:stepId", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteProjectStepParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const deleted = await db
    .delete(projectStepsTable)
    .where(
      and(
        eq(projectStepsTable.id, params.data.stepId),
        eq(projectStepsTable.projectId, project.id),
        eq(projectStepsTable.userId, uid),
      ),
    )
    .returning({ id: projectStepsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Project step not found" });
    return;
  }
  await recalculateProjectProgress(db, project.id, uid);
  res.sendStatus(204);
}));

router.post("/projects/:projectId/photos", scoped(async (req, res, db): Promise<void> => {
  const params = CreateProjectPhotoParams.safeParse(req.params);
  const body = CreateProjectPhotoBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { url: IMAGE_FIELD })) return;
  const [photo] = await db
    .insert(projectPhotosTable)
    .values({ ...body.data, projectId: project.id, userId: uid })
    .returning();
  res.status(201).json(CreateProjectPhotoResponse.parse(projectPhotoResponse(photo)));
}));

router.patch("/projects/:projectId/photos/:photoId", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateProjectPhotoParams.safeParse(req.params);
  const body = UpdateProjectPhotoBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [existingPhoto] = await db
    .select()
    .from(projectPhotosTable)
    .where(and(eq(projectPhotosTable.id, params.data.photoId), eq(projectPhotosTable.projectId, project.id), eq(projectPhotosTable.userId, uid)));
  if (!existingPhoto) {
    res.status(404).json({ error: "Project photo not found" });
    return;
  }
  if (await rejectsForeignFiles(db, req, res, body.data, { url: IMAGE_FIELD }, existingPhoto)) return;
  const [photo] = await db
    .update(projectPhotosTable)
    .set(body.data)
    .where(
      and(
        eq(projectPhotosTable.id, params.data.photoId),
        eq(projectPhotosTable.projectId, project.id),
        eq(projectPhotosTable.userId, uid),
      ),
    )
    .returning();
  if (!photo) {
    res.status(404).json({ error: "Project photo not found" });
    return;
  }
  res.json(UpdateProjectPhotoResponse.parse(projectPhotoResponse(photo)));
}));

router.delete("/projects/:projectId/photos/:photoId", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteProjectPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const uid = userId(req);
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.userId, uid)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const deleted = await db
    .delete(projectPhotosTable)
    .where(
      and(
        eq(projectPhotosTable.id, params.data.photoId),
        eq(projectPhotosTable.projectId, project.id),
        eq(projectPhotosTable.userId, uid),
      ),
    )
    .returning({ id: projectPhotosTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Project photo not found" });
    return;
  }
  res.sendStatus(204);
}));

router.get("/measurement-profiles", scoped(async (req, res, db): Promise<void> => {
  const uid = userId(req);
  const rows = await db.select().from(measurementProfilesTable).where(eq(measurementProfilesTable.userId, uid)).orderBy(desc(measurementProfilesTable.recordedAt));
  res.json(ListMeasurementProfilesResponse.parse(rows.map(measurementResponse)));
}));

router.post("/measurement-profiles", scoped(async (req, res, db): Promise<void> => {
  const parsed = CreateMeasurementProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(measurementProfilesTable)
    .values({
      ...parsed.data,
      recordedAt: dateString(parsed.data.recordedAt) as string,
      userId: userId(req),
    })
    .returning();
  res.status(201).json(CreateMeasurementProfileResponse.parse(measurementResponse(row)));
}));

router.patch("/measurement-profiles/:id", scoped(async (req, res, db): Promise<void> => {
  const params = UpdateMeasurementProfileParams.safeParse(req.params);
  const body = UpdateMeasurementProfileBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid measurement profile data" });
    return;
  }
  const [row] = await db
    .update(measurementProfilesTable)
    .set({
      ...body.data,
      recordedAt: dateString(body.data.recordedAt) as string,
    })
    .where(and(eq(measurementProfilesTable.id, params.data.id), eq(measurementProfilesTable.userId, userId(req))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Measurement profile not found" });
    return;
  }
  res.json(UpdateMeasurementProfileResponse.parse(measurementResponse(row)));
}));

router.delete("/measurement-profiles/:id", scoped(async (req, res, db): Promise<void> => {
  const params = DeleteMeasurementProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(measurementProfilesTable).where(and(eq(measurementProfilesTable.id, params.data.id), eq(measurementProfilesTable.userId, userId(req)))).returning({ id: measurementProfilesTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Measurement profile not found" });
    return;
  }
  res.sendStatus(204);
}));

router.post("/assistant/messages", async (req, res): Promise<void> => {
  const parsed = AskAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const uid = userId(req);
  let projectContext = "No project is currently selected.";

  // Read context in a short transaction; the model call below runs outside it.
  if (parsed.data.projectId) await withUser(uid, async (db) => {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, parsed.data.projectId!), eq(projectsTable.userId, uid)));

    if (project) {
      // One query at a time: this runs inside a single-connection transaction.
      const pattern = project.patternId
        ? (await db.select().from(patternsTable).where(and(eq(patternsTable.id, project.patternId), eq(patternsTable.userId, uid))))[0]
        : undefined;
      const fabric = project.fabricId
        ? (await db.select().from(fabricsTable).where(and(eq(fabricsTable.id, project.fabricId), eq(fabricsTable.userId, uid))))[0]
        : undefined;
      const measurements = project.measurementProfileId
        ? (await db.select().from(measurementProfilesTable).where(and(eq(measurementProfilesTable.id, project.measurementProfileId), eq(measurementProfilesTable.userId, uid))))[0]
        : undefined;

      projectContext = JSON.stringify({
        project: {
          name: project.name,
          stage: project.status,
          progress: project.progress,
          notes: project.notes,
          alterations: project.alterations,
          problems: project.problems,
          solutions: project.solutions,
        },
        pattern: pattern && {
          name: pattern.name,
          garmentType: pattern.garmentType,
          difficulty: pattern.difficulty,
          sizes: pattern.sizes,
          requiredFabric: pattern.requiredFabric,
          seamAllowance: pattern.seamAllowance,
          instructions: pattern.instructions,
        },
        fabric: fabric && {
          name: fabric.name,
          type: fabric.type,
          composition: fabric.composition,
          stretch: fabric.stretch,
          weight: fabric.weight,
        },
        measurements: measurements?.measurements,
      });
    }
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `You are Sewspace's expert sewing assistant. Give practical, safe, concise guidance for garment sewing, fitting, pattern adjustments, fabric handling, machine setup, construction order, and troubleshooting.

Use the maker's project context when relevant. Ask one focused follow-up question if essential information is missing. Explain unfamiliar terms. Prefer reversible checks and test swatches before irreversible cutting or stitching. Do not claim to have inspected a garment or image unless details were provided. When giving fitting advice, distinguish body measurements, pattern measurements, and finished garment measurements.

Project context:
${projectContext}`,
        },
        { role: "user", content: parsed.data.message },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("OpenAI returned an empty response");
    res.json(AskAssistantResponse.parse({ answer, mode: "live" }));
  } catch (error) {
    req.log.error({ err: error }, "Sewing assistant request failed");
    res.json(
      AskAssistantResponse.parse({
        answer: "I couldn’t reach the live sewing assistant just now. Check your needle, thread path, and tension on a folded fabric scrap first, then try your question again with the fabric type and the step you are working on.",
        mode: "demo",
      }),
    );
  }
});

router.post("/visualizations", async (req, res): Promise<void> => {
  const parsed = CreateVisualizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const uid = userId(req);
  const { pattern, fabric } = await withUser(uid, async (db) => {
    const [pattern] = await db.select().from(patternsTable).where(and(eq(patternsTable.id, parsed.data.patternId), eq(patternsTable.userId, uid)));
    const [fabric] = await db.select().from(fabricsTable).where(and(eq(fabricsTable.id, parsed.data.fabricId), eq(fabricsTable.userId, uid)));
    return { pattern, fabric };
  });
  if (!pattern || !fabric) {
    res.status(404).json({ error: "Pattern or fabric not found" });
    return;
  }
  try {
    const prompt = `Create a polished full-body fashion editorial visualization of a finished handmade garment.

Garment pattern:
- Name: ${pattern.name}
- Garment type: ${pattern.garmentType}
- Design details: ${pattern.instructions || pattern.notes || "Use a clean, wearable interpretation of this garment type"}

Fabric:
- Name: ${fabric.name}
- Color: ${fabric.color}
- Type: ${fabric.type}
- Composition: ${fabric.composition || "Not specified"}
- Weight and drape: ${fabric.weight || "Not specified"}
- Stretch: ${fabric.stretch || "Not specified"}

Show one adult model wearing the completed garment in a warm, minimal sewing-studio setting. Make the garment silhouette and construction details easy to inspect. Render the fabric color, texture, weight, drape, and print as faithfully as the written description permits. Natural pose, realistic proportions, soft daylight, premium independent sewing-pattern campaign photography. No text, labels, logos, sewing tools covering the garment, extra garments, collage, technical diagram, or pattern pieces. This is an inspirational visualization, not an exact technical reproduction.`;
    const image = await generateImageBuffer(prompt, "1024x1024");
    if (!image.length) throw new Error("Image generation returned no data");
    const objectPath = await objectStorageService.saveObjectEntity(
      image,
      "image/png",
      `visualizations/${uid}`,
    );
    await withUser(uid, (db) =>
      db.insert(uploadsTable).values({ objectPath, userId: uid, contentType: "image/png", sizeBytes: image.length, purpose: "visualization" }),
    );
    res.json(
      CreateVisualizationResponse.parse({
        id: Date.now(),
        imageUrl: `/api/storage${objectPath}`,
        mode: "live",
        disclaimer: "AI concept preview — fabric appearance and construction details may differ from the finished garment.",
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Outfit visualization failed");
    res.status(502).json({ error: "The outfit preview could not be generated. Please try again." });
  }
});

router.get("/recommendations", scoped(async (req, res, db): Promise<void> => {
  const uid = userId(req);
  const [patterns, fabrics] = await sequence([
    () => db.select().from(patternsTable).where(eq(patternsTable.userId, uid)),
    () => db.select().from(fabricsTable).where(eq(fabricsTable.userId, uid)),
  ]);
  // A recommendation pairs a pattern with a fabric; with no fabric there is nothing to pair.
  if (!fabrics.length) {
    res.json(GetRecommendationsResponse.parse([]));
    return;
  }
  const recommendations = patterns.slice(0, 4).map((pattern, index) => {
    const fabric = fabrics[index % Math.max(fabrics.length, 1)];
    const name = `${pattern.recommendedFabrics ?? ""} ${pattern.requiredFabric ?? ""}`.toLowerCase();
    const fabricText = `${fabric?.type ?? ""} ${fabric?.weight ?? ""}`.toLowerCase();
    const overlap = name.split(/[\s,/]+/).some((token) => token.length > 3 && fabricText.includes(token));
    return {
      pattern: patternResponse(pattern),
      fabric: fabricResponse(fabric),
      suitability: overlap ? 94 : 78 - index * 5,
      reason: overlap
        ? `${fabric.name} is a strong match for the ${pattern.garmentType.toLowerCase()} silhouette and the pattern’s recommended fabric family.`
        : `You have enough yardage to explore this ${pattern.garmentType.toLowerCase()} pattern, and the fabric’s weight should make a useful first toile.`,
    };
  });
  res.json(GetRecommendationsResponse.parse(recommendations));
}));

export default router;