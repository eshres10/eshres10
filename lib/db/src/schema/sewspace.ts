import {
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
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
  // Who new posts are shared with by default (migration 0015; Pip's question 7).
  defaultPostVisibility: text("default_post_visibility").notNull().default("public"),
  // Public links (migration 0016): an https shop URL and an Instagram handle.
  shopUrl: text("shop_url"),
  instagram: text("instagram"),
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
  // Phase F3 (migration 0012): the swatch colour, #rrggbb.
  colorHex: text("color_hex"),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  // Phase 5: the shared catalog page this item is (migration 0006).
  catalogId: integer("catalog_id"),
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
  // Phase 5: the shared catalog page this item is (migration 0006).
  catalogId: integer("catalog_id"),
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
  // Phase F2 (migration 0011): construction steps as short phrases. Never public.
  steps: jsonb("steps").$type<string[] | null>(),
  // Phase F3 (migration 0012): pdf | paper | traced.
  format: text("format").$type<"pdf" | "paper" | "traced" | null>(),
  status: text("status").notNull().default("want_to_make"),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  // Phase 5: the shared catalog page this item is (migration 0006).
  catalogId: integer("catalog_id"),
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

export interface ProjectSetup {
  dismissed?: boolean;
  visibilityChosen?: boolean;
  stepsChoice?: "pattern" | "own" | "none" | null;
}

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
  // Phase F2 (migration 0011): garment chip and the setup checklist state.
  garment: text("garment"),
  setup: jsonb("setup").$type<ProjectSetup>().notNull().default({}),
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

// Phase 2: processed images (full + thumbnail) and posts.
export const mediaTable = pgTable("sewspace_media", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  fullPath: text("full_path").notNull().unique(),
  thumbPath: text("thumb_path").notNull().unique(),
  sourcePath: text("source_path"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  color: text("color"),
  // Phase F1 (migration 0010): read aloud by screen readers; at most 500 characters.
  altText: text("alt_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const POST_KINDS = ["status", "photo"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const POST_ASPECTS = ["4:5", "1:1", "original"] as const;
export type PostAspect = (typeof POST_ASPECTS)[number];
export const POST_GARMENTS = ["dresses", "tops", "bottoms", "outerwear", "bags"] as const;
export type PostGarment = (typeof POST_GARMENTS)[number];
export const POST_FABRICS = ["linen", "cotton", "satin", "viscose", "crepe", "haul"] as const;
export type PostFabric = (typeof POST_FABRICS)[number];

export const postsTable = pgTable("sewspace_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  kind: text("kind").$type<PostKind>().notNull(),
  caption: text("caption").notNull().default(""),
  visibility: text("visibility").$type<Visibility>().notNull().default("private"),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  patternId: integer("pattern_id").references(() => patternsTable.id, { onDelete: "set null" }),
  fabricId: integer("fabric_id").references(() => fabricsTable.id, { onDelete: "set null" }),
  // Phase F1: display crop for the photos (object-fit: cover). Older posts are 'original'.
  aspect: text("aspect").$type<PostAspect>().notNull().default("4:5"),
  // Explore (migration 0020): optional labels the author picks; null on older posts.
  garment: text("garment").$type<PostGarment>(),
  fabric: text("fabric").$type<PostFabric>(),
  ...timestamps,
});

export const postMediaTable = pgTable("sewspace_post_media", {
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  mediaId: integer("media_id").notNull().references(() => mediaTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.postId, t.mediaId] })]);

export type Media = typeof mediaTable.$inferSelect;
export type Post = typeof postsTable.$inferSelect;

// Phase F1 (migration 0010): hashtags. Tags are created only through
// sewspace_hashtag_ids(); post tags follow their post.
export const hashtagsTable = pgTable("sewspace_hashtags", {
  id: serial("id").primaryKey(),
  tag: text("tag").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postHashtagsTable = pgTable("sewspace_post_hashtags", {
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  hashtagId: integer("hashtag_id").notNull().references(() => hashtagsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
}, (t) => [primaryKey({ columns: [t.postId, t.hashtagId] })]);

// Phase 4: likes, comments (one level of replies), saves and reports (migration 0005).
export const likesTable = pgTable("sewspace_likes", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const commentsTable = pgTable("sewspace_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Comment likes (migration 0021): private to the liker; counts come from sewspace_comment_like_counts(). */
export const commentLikesTable = pgTable("sewspace_comment_likes", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  commentId: integer("comment_id").notNull().references(() => commentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.commentId] })]);

export const savesTable = pgTable("sewspace_saves", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const REPORT_KINDS = ["post", "comment", "profile", "review", "challenge", "topic", "forum_reply"] as const;
export const REPORT_REASONS = ["spam", "harassment", "nudity", "violence", "intellectual_property", "other"] as const;
export const REPORT_STATUSES = ["open", "removed", "dismissed"] as const;

export const reportsTable = pgTable("sewspace_reports", {
  id: serial("id").primaryKey(),
  reporterId: varchar("reporter_id", { length: 255 }).notNull(),
  targetKind: text("target_kind").$type<(typeof REPORT_KINDS)[number]>().notNull(),
  targetId: text("target_id").notNull(),
  targetUserId: varchar("target_user_id", { length: 255 }).notNull(),
  reason: text("reason").$type<(typeof REPORT_REASONS)[number]>().notNull(),
  details: text("details").notNull().default(""),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").$type<(typeof REPORT_STATUSES)[number]>().notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: varchar("resolved_by", { length: 255 }),
});

// Phase 5: shared pattern and product pages, and reviews (migration 0006).
export const CATALOG_KINDS = ["pattern", "product"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const catalogTable = pgTable("sewspace_catalog", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<CatalogKind>().notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  maker: text("maker").notNull().default(""),
  category: text("category").notNull(),
  difficulty: text("difficulty"),
  sizes: text("sizes"),
  fabricTypes: text("fabric_types"),
  yardage: text("yardage"),
  url: text("url"),
  description: text("description").notNull().default(""),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  // Migration 0016: where to get it, a price in the page's own currency, and
  // the designer's own account (only settable to yourself, or by an admin).
  source: text("source").$type<CatalogSource>().notNull().default("designer"),
  priceCents: integer("price_cents"),
  currency: text("currency"),
  designerId: varchar("designer_id", { length: 255 }),
  ...timestamps,
});

export type CatalogSource = "designer" | "free" | "seams_club";

// Size chart rows, body measurements in cm (migration 0016). Public; the page's creator writes.
export const catalogSizesTable = pgTable("sewspace_catalog_sizes", {
  catalogId: integer("catalog_id").notNull().references(() => catalogTable.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  label: text("label").notNull(),
  bustCm: real("bust_cm"),
  waistCm: real("waist_cm"),
  hipCm: real("hip_cm"),
}, (t) => [primaryKey({ columns: [t.catalogId, t.label] })]);

// Saved patterns (the heart, migration 0016): private to the saver.
export const catalogSavesTable = pgTable("sewspace_catalog_saves", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  catalogId: integer("catalog_id").notNull().references(() => catalogTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.catalogId] })]);

export const reviewsTable = pgTable("sewspace_reviews", {
  id: serial("id").primaryKey(),
  catalogId: integer("catalog_id").notNull().references(() => catalogTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  rating: smallint("rating").notNull(),
  fit: smallint("fit"),
  difficulty: smallint("difficulty"),
  instructions: smallint("instructions"),
  sizing: text("sizing").$type<"small" | "true" | "large">(),
  sizeMade: text("size_made"),
  body: text("body").notNull().default(""),
  // From a fixed list (migration 0016), for "Common alterations".
  alterations: text("alterations").array().notNull().default([]),
  makeId: integer("make_id").references(() => projectsTable.id, { onDelete: "set null" }),
  ...timestamps,
});

export const reviewVotesTable = pgTable("sewspace_review_votes", {
  reviewId: integer("review_id").notNull().references(() => reviewsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.reviewId, t.userId] })]);

export type CatalogEntry = typeof catalogTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;

// Phase 6: challenges (migration 0007).
export const challengesTable = pgTable("sewspace_challenges", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  tag: text("tag").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  rules: text("rules").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  ...timestamps,
});

export const challengeMembersTable = pgTable("sewspace_challenge_members", {
  challengeId: integer("challenge_id").notNull().references(() => challengesTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.challengeId, t.userId] })]);

export const challengeEntriesTable = pgTable("sewspace_challenge_entries", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull().references(() => challengesTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removedBy: varchar("removed_by", { length: 255 }),
});

export type Challenge = typeof challengesTable.$inferSelect;

// Phase 7: the forum (migration 0008).
export const FORUM_BOARDS = ["fitting", "fabric", "machines", "patterns", "beginners", "mending", "meetups"] as const;
export const FORUM_KINDS = ["show_tell", "question", "recommendation", "info", "poll"] as const;
export type ForumBoard = (typeof FORUM_BOARDS)[number];
export type ForumKind = (typeof FORUM_KINDS)[number];

export const forumTopicsTable = pgTable("sewspace_forum_topics", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  board: text("board").$type<ForumBoard>().notNull(),
  kind: text("kind").$type<ForumKind>().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  catalogId: integer("catalog_id").references(() => catalogTable.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  acceptedReplyId: integer("accepted_reply_id"),
  pinned: boolean("pinned").notNull().default(false),
  locked: boolean("locked").notNull().default(false),
  pollClosesAt: timestamp("poll_closes_at", { withTimezone: true }),
  voteCount: integer("vote_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  ...timestamps,
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forumRepliesTable = pgTable("sewspace_forum_replies", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => forumTopicsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  body: text("body").notNull(),
  catalogId: integer("catalog_id").references(() => catalogTable.id, { onDelete: "set null" }),
  voteCount: integer("vote_count").notNull().default(0),
  ...timestamps,
});

export const forumVotesTable = pgTable("sewspace_forum_votes", {
  targetKind: text("target_kind").$type<"topic" | "reply">().notNull(),
  targetId: integer("target_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.targetKind, t.targetId, t.userId] })]);

// Show & tell photos on a topic (migration 0013); they follow their topic.
export const forumTopicMediaTable = pgTable("sewspace_forum_topic_media", {
  topicId: integer("topic_id").notNull().references(() => forumTopicsTable.id, { onDelete: "cascade" }),
  mediaId: integer("media_id").notNull().references(() => mediaTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  position: smallint("position").notNull(),
}, (t) => [primaryKey({ columns: [t.topicId, t.mediaId] })]);

export const forumPollOptionsTable = pgTable("sewspace_forum_poll_options", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => forumTopicsTable.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  label: text("label").notNull(),
});

export const forumPollVotesTable = pgTable("sewspace_forum_poll_votes", {
  topicId: integer("topic_id").notNull().references(() => forumTopicsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  optionId: integer("option_id").notNull().references(() => forumPollOptionsTable.id, { onDelete: "cascade" }),
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.topicId, t.userId] })]);

// Phase F0: one draft per person per flow (owner-only, migration 0009).
export const DRAFT_KINDS = ["post", "project", "stash", "topic"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const draftsTable = pgTable("sewspace_drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  kind: text("kind").$type<DraftKind>().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("sewspace_drafts_user_kind_idx").on(t.userId, t.kind)]);

export type Draft = typeof draftsTable.$inferSelect;

// Phase S2: "My ideas" on the studio overview. Private to the owner (RLS owner_all).
export const ideasTable = pgTable("sewspace_ideas", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  patternId: integer("pattern_id").notNull().references(() => patternsTable.id, { onDelete: "cascade" }),
  fabricId: integer("fabric_id").notNull().references(() => fabricsTable.id, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  ...timestamps,
});

export type Idea = typeof ideasTable.$inferSelect;

// Phase O (migration 0015): answers to Pip's onboarding questions. Private to
// the owner (owner_all only); allowed values are CHECKed in SQL.
export const onboardingTable = pgTable("sewspace_onboarding", {
  userId: varchar("user_id", { length: 255 }).primaryKey().references(() => profilesTable.userId, { onDelete: "cascade" }),
  currentStep: smallint("current_step").notNull().default(0),
  goals: text("goals").array().notNull().default([]),
  experience: text("experience"),
  tools: text("tools").array().notNull().default([]),
  stashSize: text("stash_size"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedAt: timestamp("skipped_at", { withTimezone: true }),
  writeCount: integer("write_count").notNull().default(0),
  writeWindowAt: timestamp("write_window_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export type Onboarding = typeof onboardingTable.$inferSelect;

export type ForumTopic = typeof forumTopicsTable.$inferSelect;
export type ForumReply = typeof forumRepliesTable.$inferSelect;

export type Comment = typeof commentsTable.$inferSelect;
export type Report = typeof reportsTable.$inferSelect;

// Read-only view of profile fields that anyone may see (migration 0001).
export const publicProfilesView = pgView("sewspace_public_profiles", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  handle: text("handle").notNull(),
  name: text("name").notNull(),
  bio: text("bio").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  shopUrl: text("shop_url"),
  instagram: text("instagram"),
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

// Notifications (migration 0019): written only by database triggers on likes,
// comments, follows, forum replies, accepted answers and challenge entries; the
// recipient reads them (RLS hides blocked actors and things they can't see) and
// may only set read_at.
export const NOTIFICATION_KINDS = ["like", "comment", "comment_reply", "follow", "forum_reply", "answer_accepted", "challenge_entry"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const notificationsTable = pgTable("sewspace_notifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  recipientId: varchar("recipient_id", { length: 255 }).notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  kind: text("kind").$type<NotificationKind>().notNull(),
  postId: integer("post_id"),
  commentId: integer("comment_id"),
  topicId: integer("topic_id"),
  replyId: integer("reply_id"),
  challengeId: integer("challenge_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

// Explore (migration 0020): private collections of saved things, and private
// "see less" / "more like this" feedback. Owner-only (RLS owner_all).
export const EXPLORE_ITEM_TYPES = ["post", "pattern", "challenge", "thread"] as const;
export type ExploreItemType = (typeof EXPLORE_ITEM_TYPES)[number];
export const FEEDBACK_KINDS = ["see_less", "more_like"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const collectionsTable = pgTable("sewspace_collections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: text("name").notNull(),
  visibility: text("visibility").$type<"private">().notNull().default("private"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionItemsTable = pgTable("sewspace_collection_items", {
  collectionId: integer("collection_id").notNull().references(() => collectionsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  itemType: text("item_type").$type<ExploreItemType>().notNull(),
  itemId: integer("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.collectionId, t.itemType, t.itemId] })]);

export const discoverFeedbackTable = pgTable("sewspace_discover_feedback", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  itemType: text("item_type").$type<ExploreItemType>().notNull(),
  itemId: integer("item_id").notNull(),
  kind: text("kind").$type<FeedbackKind>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemType, t.itemId, t.kind] })]);
