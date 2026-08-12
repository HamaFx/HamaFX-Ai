-- Migration 0069: restore public schema API grants
--
-- A clean public-schema rebuild removes table-level grants. Restore the
-- standard Supabase role privileges and default privileges so PostgREST and
-- future tables continue to work with RLS as the row-level boundary.

GRANT USAGE ON SCHEMA "public" TO "anon", "authenticated", "service_role";
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA "public"
  TO "anon", "authenticated";
--> statement-breakpoint

GRANT ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA "public"
  TO "service_role";
--> statement-breakpoint

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA "public"
  TO "anon", "authenticated";
--> statement-breakpoint

GRANT ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA "public"
  TO "service_role";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL PRIVILEGES ON TABLES
  TO "service_role";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES
  TO "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL PRIVILEGES ON SEQUENCES
  TO "service_role";
