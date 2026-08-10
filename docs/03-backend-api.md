# Backend API

The web app exposes App Router route handlers under `apps/web/src/app/api`. Authentication-required routes use the shared `withAuth` wrapper, while administrative routes use `withAdminAuth` and cron routes use bearer authentication.

## Boundaries

- Browser API calls must include the authenticated session and CSRF protection for state-changing requests.
- Route handlers must scope user-owned reads and writes to the authenticated `userId`.
- AI tools execute inside an explicit tool context; they must not infer identity from client-provided input.
- Database schema changes require a new Drizzle migration. Do not edit applied migrations.

See the route tree and generated architecture artifacts for the current complete route inventory.
