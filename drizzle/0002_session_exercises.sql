CREATE TABLE "session_exercises" (
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"sort_order" smallint NOT NULL,
	"target_sets" smallint DEFAULT 3 NOT NULL,
	"target_reps" smallint DEFAULT 8 NOT NULL,
	CONSTRAINT "session_exercises_session_id_exercise_id_pk" PRIMARY KEY("session_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;