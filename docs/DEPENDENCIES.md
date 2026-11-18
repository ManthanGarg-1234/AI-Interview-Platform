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
- provider-specific email, object storage, AI, and JDoodle integrations only after
  provider selection
- `supertest` and test database tooling

Exact versions should be selected together for Node 20/22 LTS compatibility;
Node 25 is available locally but should not be assumed as the production runtime
without an explicit support decision.

## Missing local tools

Not found at the time of this original inventory: PostgreSQL server/client
(`psql`), Redis (`redis-server`), and Docker. PostgreSQL and Redis may be
provided by approved native services or managed hosting. Docker is optional;
JDoodle execution does not require Docker Desktop or a local execution stack.

## Manual setup required

1. Provision PostgreSQL and Redis through an approved native or managed service.
2. Verify `psql --version` and `redis-cli --version` when those clients are
   available; Docker is not a prerequisite.
3. Configure the existing `DATABASE_URL` and `REDIS_URL` for those services.
   JDoodle credentials remain server-side and are not exposed to React.

The preceding setup inventory is historical. The current repository contains
its manifests and Compose file, but neither Docker nor Compose is required for
the JDoodle provider. See [JDOODLE_CONFIGURATION.md](./JDOODLE_CONFIGURATION.md)
for the current execution configuration.

## External services and credentials requiring user involvement

- PostgreSQL hosting/connection URL and backup policy.
- Redis hosting/connection URL.
- AI provider account, API key, model policy, budget, retention, and regional
  data-processing decision.
- Email provider credentials and verified sender/domain.
- Object storage account, bucket, region, private access policy, and lifecycle.
- JDoodle Compiler REST API credentials and Java version index.
- WebRTC signaling deployment and TURN server credentials.
- Production hosting, DNS, TLS, observability, and secret management.
- OAuth/GitHub/LeetCode integration credentials only if those integrations are
  approved.

Never put these values in source, frontend bundles, Git, or documentation.

## Approved service decisions

- PostgreSQL and Redis may be local native services or managed services; Docker
  Compose is optional.
- Release 1 uses an external LLM API behind a backend provider abstraction.
- Release 1 uses JDoodle behind the existing code execution adapter and BullMQ worker; Java is enabled first.
- Release 1 uses SSE for AI streaming and text-only interviews.
- Voice, WebRTC/TURN, and media storage are Release 2 unless separately
  approved.
