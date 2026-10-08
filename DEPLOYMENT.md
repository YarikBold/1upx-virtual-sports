# 1UPX free deployment

The repository is prepared for a Render Free Node web service. The service runs
the existing Fastify backend, Prisma migrations, and the existing React build;
no game engine or design code is replaced.

## Render

1. Push this repository to a **private** GitHub/GitLab/Bitbucket repository.
2. In Render, create a Blueprint from that repository. Render will read
   `render.yaml`.
3. Set `DATABASE_URL` to the Supabase transaction pooler URL and `DIRECT_URL`
   to the Supabase session pooler URL as secret environment variables. Do not
   commit either value.
4. Apply the Blueprint and wait for `GET /api/health` to return HTTP 200.

The build generates Prisma Client and the frontend bundle. `preDeployCommand`
applies only pending, non-destructive Prisma migrations before the new service
receives traffic. The server listens on `0.0.0.0:$PORT`; Render supplies the
port and HTTPS at its edge.

## Current integration boundary

The current frontend uses the existing cookie session API and relative `/api`
requests. It is therefore ready to run when the frontend and API are served by
the same origin (the current Node service serves `dist`). A separate
Cloudflare Pages origin requires the planned Supabase Auth/JWT and CORS
adaptation before it can be declared production-ready; this deployment file
does not silently weaken that boundary.

## Cloudflare Pages after the auth boundary is completed

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- SPA fallback: rewrite all non-file routes to `/index.html`
- Set the public API URL and Supabase public project settings in Pages
  environment variables; never add the database URLs or service-role key.

Render Free may sleep after inactivity. Seasons remain correct because their
authoritative timestamps and fixtures are stored in Supabase PostgreSQL.
