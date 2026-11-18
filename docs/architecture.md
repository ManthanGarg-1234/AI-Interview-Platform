# CareerPrepAI architecture

## Repository map

```text
frontend/
  src/
    components/       shared layout and reusable UI
      ui/             accessible buttons, fields, overlays, states, and tabs
    context/          authentication-ready, theme, and toast providers
    lib/              API client and route helpers
    pages/            public pages and existing portal features
    styles.css        Tailwind entry point, design tokens, responsive styles
backend/
  api.js              versioned REST API routes
  index.js            Express, HTTP, and Socket.IO application entry
  config/             environment validation
  tests/              API and service tests
  *.js                existing domain modules and workers
prisma/
  schema.prisma       PostgreSQL data model
  migrations/         committed, ordered SQL migrations
prisma.config.ts      Prisma schema, datasource, and seed configuration
docs/
docker-compose.yml   local PostgreSQL and Redis services
```

The existing `frontend/` and `backend/` paths are intentionally retained. The repository already has a large installed implementation and pending local edits; moving active modules as part of a foundation pass would create unnecessary risk. New frontend components live under `frontend/src/components/ui`, frontend providers under `frontend/src/context`, and backend configuration utilities under `backend/config`.

## Request and data flow

```text
Browser (React + Vite)
  -> Axios client (/api/v1, credentials included)
  -> Express middleware (Helmet, CORS, cookies, JSON, Morgan)
  -> /api/v1 REST router and domain modules
  -> Prisma Client
  -> PostgreSQL
Workers and real-time modules use Redis/BullMQ and Socket.IO as configured.
```

## API and health

REST endpoints are versioned under `/api/v1`. The health route checks PostgreSQL with a lightweight query and Redis with `PING` when configured. Its response contains dependency states only, never URLs, credentials, or low-level connection errors. Unknown routes return a consistent JSON `NOT_FOUND` response; application errors use the centralized handler.

## Frontend conventions

- `App.jsx` owns route composition; portal pages continue to use the existing route and session behavior.
- `AuthProvider` shares the current-user query; it does not create client-only authentication.
- `ThemeProvider` persists the selected light/dark theme when browser storage is available.
- `ToastProvider` exposes `useToast()` for transient notices.
- Reusable controls and layout primitives are exported from `frontend/src/components/ui`.
- Tailwind utilities are used for component layout; `styles.css` owns theme tokens, public landing-page styles, and responsive breakpoints.

## Database and migrations

PostgreSQL connection configuration is provided through `DATABASE_URL`; no connection credentials belong in application source code. `prisma.config.ts` declares the schema, migration directory, seed command, and datasource. Prisma schema changes should be made in `prisma/schema.prisma` and recorded as a new, timestamped directory under `prisma/migrations/`. Use `npm run db:migrate:dev` for local development and `npm run db:migrate:deploy` in deployment environments. Do not edit an already-applied migration.

## Configuration

- Root `.env.example`: local API, database, Redis, worker, and integration settings.
- `backend/.env.example`: minimal API runtime settings.
- `frontend/.env.example`: optional Vite API base URL.
- Never commit `.env` files or real integration credentials. Compose's existing sample database user/password are for local development only.

## Future monorepo evolution

The requested `client/`, `shared/`, and more granular `backend/src/` layout remains a possible later migration. It should be implemented as a separately reviewed refactor with import, build, worker, and migration-path verification—not by duplicating the active source tree.
