-- Schema as it existed on Replit before migrations were introduced (created with drizzle-kit push).
-- The runner marks this as applied without running it on databases that already have these tables.

CREATE TABLE "sewspace_fabrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"color" text NOT NULL,
	"width" real,
	"quantity" real,
	"unit" text DEFAULT 'm' NOT NULL,
	"composition" text,
	"stretch" text,
	"weight" text,
	"notes" text,
	"image_url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_measurement_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"recorded_at" date NOT NULL,
	"notes" text,
	"measurements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"designer" text,
	"garment_type" text NOT NULL,
	"difficulty" text NOT NULL,
	"sizes" text,
	"required_fabric" text,
	"yardage" real,
	"recommended_fabrics" text,
	"seam_allowance" text,
	"instructions" text,
	"notes" text,
	"cover_image_url" text,
	"pdf_url" text,
	"pdf_file_name" text,
	"status" text DEFAULT 'want_to_make' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text DEFAULT 'Maker' NOT NULL,
	"experience" text DEFAULT 'beginner' NOT NULL,
	"favorite_garments" text[] DEFAULT '{}' NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sewspace_profiles_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "sewspace_project_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"file_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_project_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"pattern_id" integer,
	"fabric_id" integer,
	"thread_id" integer,
	"measurement_profile_id" integer,
	"cover_image_url" text,
	"description" text,
	"notes" text,
	"alterations" text,
	"problems" text,
	"solutions" text,
	"completed_at" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sewspace_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"brand" text NOT NULL,
	"color" text NOT NULL,
	"color_name" text NOT NULL,
	"type" text NOT NULL,
	"weight" text,
	"quantity" real,
	"notes" text,
	"image_url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "sewspace_project_photos" ADD CONSTRAINT "sewspace_project_photos_project_id_sewspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."sewspace_projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sewspace_project_steps" ADD CONSTRAINT "sewspace_project_steps_project_id_sewspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."sewspace_projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sewspace_projects" ADD CONSTRAINT "sewspace_projects_pattern_id_sewspace_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."sewspace_patterns"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "sewspace_projects" ADD CONSTRAINT "sewspace_projects_fabric_id_sewspace_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."sewspace_fabrics"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "sewspace_projects" ADD CONSTRAINT "sewspace_projects_thread_id_sewspace_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."sewspace_threads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "sewspace_projects" ADD CONSTRAINT "sewspace_projects_measurement_profile_id_sewspace_measurement_profiles_id_fk" FOREIGN KEY ("measurement_profile_id") REFERENCES "public"."sewspace_measurement_profiles"("id") ON DELETE set null ON UPDATE no action;