CREATE TABLE "pending_parses" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
