# CareerPrepAI

**Prepare Smarter. Interview Better. Get Hired.**

CareerPrepAI is a career preparation and hiring platform. This repository already contains an active React frontend, Express API, Prisma/PostgreSQL data layer, and platform modules. Phase 1 adds a polished public entry point and strengthens the shared application foundation without relocating or replacing existing modules.

## Development setup

### Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop with Docker Compose, or local PostgreSQL 16+ and Redis 7+

### Install and configure

```powershell
npm ci
npm ci --prefix frontend
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate:dev
```

The root `.env` supplies the API, Prisma, and local Compose PostgreSQL settings. Set `POSTGRES_PASSWORD` and the password in `DATABASE_URL` to the same local-only value before starting Compose. `frontend/.env` is optional for the Vite proxy default. `backend/.env.example` documents the settings needed when running the API from the `backend` directory. Replace example secrets before exposing any service; do not commit `.env` files.

**Migration history:** four existing migration directories were missing `migration.sql` files in this worktree. The original SQL was restored from Git history after verifying its checksums against the already-applied database records. The new migration that removes retired student features is destructive and has not been applied; review and apply it intentionally before running the updated application against an existing database.

The student portal retains Coding Practice, preparation sheets, and Resume Analysis. Assessments, AI Mentor, the resource library, and contests have been removed from the application.

### Run the application

Start the API and frontend in separate terminals:

```powershell
npm run dev
npm --prefix frontend run dev
```

- Web app: <http://localhost:5173>
- Versioned API: <http://localhost:3000/api/v1>
- Dependency health: <http://localhost:3000/api/v1/health>

The health endpoint reports only `ready`, `unavailable`, or `not_configured` for PostgreSQL and Redis. It does not return connection details. Compose publishes its Redis service on host port `6380` to avoid colliding with an existing local Redis service on `6379`.

### Firebase Google authentication

1. In Firebase Console, open Authentication and enable the Google sign-in provider.
2. Add `localhost` and deployed frontend domains to Firebase Authentication authorized domains.
3. Set the Firebase Web app values in `frontend/.env`.
4. Set `FIREBASE_PROJECT_ID=careerprepai-a22e7` in the root `.env`.
5. Restart the API and frontend. The login and student registration screens will use Firebase when the frontend configuration is complete; they preserve the server-backed CareerPrepAI session cookies.

The backend verifies Firebase ID tokens with Firebase Admin and rejects revoked or invalid Google identities. Existing email/password accounts are not automatically linked; the user must sign in through the existing account flow.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the Vite frontend |
| `npm --prefix frontend test` | Run frontend tests |
| `npm test` | Run the Node.js API test suite |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate:dev` | Create/apply a development migration |
| `npm run db:migrate:deploy` | Apply committed migrations |
| `npm run db:status` | Check migration status |
| `npm run worker` | Start resume processing worker |
| `npm run coding-worker` | Start coding execution worker |

## Architecture

- **Frontend:** React 19, Vite, JavaScript, Tailwind CSS 4, React Router, Axios, TanStack Query, React Hook Form, Zod, Motion, Recharts, and Lucide.
- **Backend:** Node.js, Express 5, versioned REST API, Socket.IO, environment validation, centralized errors, and request logging.
- **Persistence:** PostgreSQL and Prisma. The schema and existing migrations are retained; application database credentials are supplied using `DATABASE_URL` and required `POSTGRES_*` Compose variables. Use local-only values and do not commit them.
- **Infrastructure:** Docker Compose provides PostgreSQL and Redis for local development. Redis is published to `localhost:6380` for the host-run API and workers.

See [docs/architecture.md](./docs/architecture.md) for the module map, routing conventions, and migration policy, and [docs/security/authentication-architecture.md](./docs/security/authentication-architecture.md) for the authentication foundation.

## Existing implementation and phase boundaries

The repository predates Phase 1 and includes working feature modules and local uncommitted changes. The established `frontend/` and `backend/` locations remain canonical; this phase does not move them to `client/` or `backend/src/`. New modules follow the current structure and are integrated with its shared providers, routes, API, and Prisma client. Existing later-phase features are preserved, not reimplemented by this foundation work.

Password reset is deliberately an informational placeholder until the later authentication phase; it does not pretend to send a reset email. Protected application routes continue to use the existing server-backed session check rather than fabricated client authentication.