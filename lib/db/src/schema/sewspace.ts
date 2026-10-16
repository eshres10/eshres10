import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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