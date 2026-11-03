# Dependency and Environment Plan

## Currently installed

From `package.json`/lockfile and `npm list --depth=0`:

- Node.js `v25.9.0` (project engine currently says `>=20`)
- npm `11.12.1`
- `express@5.3.0` (manifest range `^5.1.0`)
- `dotenv@16.6.1` (manifest range `^16.4.7`)
- Java/Javac `21.0.9`

The current package manifest has no React, Vite, Tailwind, Prisma, PostgreSQL
client, test browser, queue, AI, or WebRTC dependencies.

## Planned frontend dependencies

Install only when Phase 0 is approved and the workspace is ready:

- `react`, `react-dom`, `vite`, `@vitejs/plugin-react`
- `react-router-dom`, `axios`, `@tanstack/react-query`
- `react-hook-form`, `zod`, `@hookform/resolvers`
- `tailwindcss`, `@tailwindcss/vite` or the version-compatible Vite integration
- `framer-motion`, `recharts`, `lucide-react`, `@monaco-editor/react`
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `playwright`

## Planned backend dependencies

- `express`, `cors`, `helmet`, `cookie-parser`, `express-rate-limit`
- `zod`, `bcrypt`/approved password hashing library, secure token library
- `prisma`, `@prisma/client`
- `pg` if required by the selected Prisma setup
- `socket.io`
- `ioredis`, `bullmq`
- provider-specific email, object storage, AI, and Judge0 clients only after
  provider selection
- `supertest` and test database tooling

Exact versions should be selected together for Node 20/22 LTS compatibility;
Node 25 is available locally but should not be assumed as the production runtime
without an explicit support decision.

## Missing local tools

Not found: PostgreSQL server/client (`psql`), Redis (`redis-server`), and Docker.
Recommended development setup is Docker Desktop with PostgreSQL and Redis, or
approved native installations.

## Manual setup required

1. Install Docker Desktop from the approved organizational source, or install
   PostgreSQL and Redis using approved local packages.
2. Verify:
   - `docker --version`
   - `docker compose version`
   - `psql --version`
   - `redis-cli --version`
3. After the approved dependency manifests exist, run from the repository root:
   - `npm install`
   - `docker compose up -d postgres redis`
   - `npx prisma migrate dev`
4. Copy `.env.example` to `.env` and set local database/session values.

These commands are intentionally not run yet because dependency manifests and
Docker Compose configuration have not been created, and the user requested
approval before substantial changes.

## External services and credentials requiring user involvement

- PostgreSQL hosting/connection URL and backup policy.
- Redis hosting/connection URL.
- AI provider account, API key, model policy, budget, retention, and regional
  data-processing decision.
- Email provider credentials and verified sender/domain.
- Object storage account, bucket, region, private access policy, and lifecycle.
- Judge0 hosted/self-managed endpoint and optional API key/host.
- WebRTC signaling deployment and TURN server credentials.
- Production hosting, DNS, TLS, observability, and secret management.
- OAuth/GitHub/LeetCode integration credentials only if those integrations are
  approved.

Never put these values in source, frontend bundles, Git, or documentation.
