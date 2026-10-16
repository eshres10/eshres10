import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Who can see a row: everyone, the owner's followers, or only the owner.
export const VISIBILITIES = ["public", "followers", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const profilesTable = pgTable("sewspace_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  name: text("name").notNull().default("Maker"),
  experience: text("experience").notNull().default("beginner"),
  favoriteGarments: text("favorite_garments").array().notNull().default([]),
  units: text("units").notNull().default("metric"),
  // Public identity (migration 0001). Readable by others only through the
  // sewspace_public_profiles view.
  handle: text("handle"),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  ...timestamps,
});

export const fabricsTable = pgTable("sewspace_fabrics", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color").notNull(),
  width: real("width"),
  quantity: real("quantity"),
  unit: text("unit").notNull().default("m"),
  composition: text("composition"),
  stretch: text("stretch"),
  weight: text("weight"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const threadsTable = pgTable("sewspace_threads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  brand: text("brand").notNull(),
  color: text("color").notNull(),
  colorName: text("color_name").notNull(),
  type: text("type").notNull(),
  weight: text("weight"),
  quantity: real("quantity"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const patternsTable = pgTable("sewspace_patterns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: text("name").notNull(),
  designer: text("designer"),
  garmentType: text("garment_type").notNull(),
  difficulty: text("difficulty").notNull(),
  sizes: text("sizes"),
  requiredFabric: text("required_fabric"),
  yardage: real("yardage"),
  recommendedFabrics: text("recommended_fabrics"),
  seamAllowance: text("seam_allowance"),
  instructions: text("instructions"),
  notes: text("notes"),
  coverImageUrl: text("cover_image_url"),
  pdfUrl: text("pdf_url"),
  pdfFileName: text("pdf_file_name"),
  status: text("status").notNull().default("want_to_make"),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const measurementProfilesTable = pgTable("sewspace_measurement_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: text("name").notNull(),
  recordedAt: date("recorded_at", { mode: "string" }).notNull(),
  notes: text("notes"),
  measurements: jsonb("measurements")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  ...timestamps,
});

export const projectsTable = pgTable("sewspace_projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("planning"),
  progress: integer("progress").notNull().default(0),
  patternId: integer("pattern_id").references(() => patternsTable.id, {
    onDelete: "set null",
  }),
  fabricId: integer("fabric_id").references(() => fabricsTable.id, {
    onDelete: "set null",
  }),
  threadId: integer("thread_id").references(() => threadsTable.id, {
    onDelete: "set null",
  }),
  measurementProfileId: integer("measurement_profile_id").references(
    () => measurementProfilesTable.id,
    { onDelete: "set null" },
  ),
  coverImageUrl: text("cover_image_url"),
  description: text("description"),
  notes: text("notes"),
  alterations: text("alterations"),
  problems: text("problems"),
  solutions: text("solutions"),
  completedAt: date("completed_at", { mode: "string" }),
  // Phase 1: who can see this make, its size, and when it was first shared.
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  size: text("size"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const projectStepsTable = pgTable("sewspace_project_steps", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const projectPhotosTable = pgTable("sewspace_project_photos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  fileName: text("file_name"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Who uploaded each stored object. Read through RLS by the storage route.
export const uploadsTable = pgTable("sewspace_uploads", {
  objectPath: text("object_path").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  purpose: text("purpose").notNull().default("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const followsTable = pgTable("sewspace_follows", {
  followerId: varchar("follower_id", { length: 255 }).notNull(),
  followeeId: varchar("followee_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })]);

export const blocksTable = pgTable("sewspace_blocks", {
  blockerId: varchar("blocker_id", { length: 255 }).notNull(),
  blockedId: varchar("blocked_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

// Read-only view of profile fields that anyone may see (migration 0001).
export const publicProfilesView = pgView("sewspace_public_profiles", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  handle: text("handle").notNull(),
  name: text("name").notNull(),
  bio: text("bio").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}).existing();

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertFabricSchema = createInsertSchema(fabricsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertThreadSchema = createInsertSchema(threadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPatternSchema = createInsertSchema(patternsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertMeasurementProfileSchema = createInsertSchema(
  measurementProfilesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectStepSchema = createInsertSchema(projectStepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectPhotoSchema = createInsertSchema(projectPhotosTable).omit({
  id: true,
  createdAt: true,
});

export type Profile = typeof profilesTable.$inferSelect;
export type Fabric = typeof fabricsTable.$inferSelect;
export type Thread = typeof threadsTable.$inferSelect;
export type Pattern = typeof patternsTable.$inferSelect;
export type MeasurementProfile = typeof measurementProfilesTable.$inferSelect;
export type Project = typeof projectsTable.$inferSelect;
export type ProjectStep = typeof projectStepsTable.$inferSelect;
export type ProjectPhoto = typeof projectPhotosTable.$inferSelect;
export type Upload = typeof uploadsTable.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type InsertFabric = z.infer<typeof insertFabricSchema>;
export type InsertThread = z.infer<typeof insertThreadSchema>;
export type InsertPattern = z.infer<typeof insertPatternSchema>;
export type InsertMeasurementProfile = z.infer<
  typeof insertMeasurementProfileSchema
>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectStep = z.infer<typeof insertProjectStepSchema>;
export type InsertProjectPhoto = z.infer<typeof insertProjectPhotoSchema>;