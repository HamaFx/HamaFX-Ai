-- Migration 0070: restrict public API role table grants
--
-- Kestrel uses server-side PostgreSQL access rather than direct browser
-- PostgREST table access. Revoke broad table/sequence privileges from
-- anon/authenticated because several public tables are intentionally not
-- protected by RLS. service_role remains the privileged Supabase role.

REVOKE ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA "public"
  FROM "anon", "authenticated";
--> statement-breakpoint

REVOKE ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA "public"
  FROM "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
