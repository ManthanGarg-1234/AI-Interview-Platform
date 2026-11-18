# Security Plan

## Current security gaps

- Demo passwords accept any non-empty value and are not authenticated server-side.
- Browser localStorage is trusted for roles, sessions, and business records.
- Coding API uses a demo header and JSON storage.
- Local Java runner is not a hardened hostile-code sandbox.
- No PostgreSQL, CSRF strategy, secure headers, email verification, object
  storage validation, centralized audit/security events, or production rate
  limiting exists.

## Target controls

- Server-side RBAC plus resource ownership and company membership checks.
- Password hashing, secure HTTP-only cookies, refresh rotation, revocation,
  session status, email verification, reset token expiry, and account suspension.
- Zod validation, output encoding, parameterized Prisma queries, CORS allowlist,
  CSRF protection for cookie mutations, Helmet/security headers, rate limits,
  request IDs, and structured redacted logs.
- Upload allowlist, size/type/content checks, malware scanning boundary, private
  object storage, signed access URLs, retention, and deletion workflows.
- Consent records for data sharing, recording, camera/microphone/screen use, and
  AI context. Minimize AI context and never expose provider keys to the client.
- Audit logs for authentication, permissions, hiring decisions, moderation,
  exports, settings, and data access.
- Isolated code execution with no network, resource quotas, process cleanup,
  language allowlist, hidden tests, queue limits, and provider health handling.
- Human review and appeal process for misconduct; AI flags are never proof.

## Threats to test

Unauthorized access, role escalation, IDOR/cross-user reads, token replay,
brute-force login, CSRF, XSS, SQL injection, malicious uploads, data export
abuse, prompt injection/context leakage, WebRTC consent failures, queue abuse,
code sandbox escape, denial of service, and sensitive log leakage.

## Operational requirements

Secrets belong in environment/secret management, not Git. PostgreSQL backups,
restore tests, dependency scanning, vulnerability response, security monitoring,
and data-retention policies must be established before production deployment.

## Approved security decisions

- Use secure HTTP-only cookies, short-lived access tokens, rotated refresh
  tokens, server-side session records, revocation, and CSRF protection.
- Keep all LLM credentials, JDoodle credentials, model configuration, and cost
  controls on the backend.
- Use JDoodle behind the existing dedicated adapter and BullMQ worker in
  Release 1; Express and the worker host never execute submitted code locally.
- Use configurable retention policies and consent records. Proposed engineering
  defaults are documented in [DATA_RETENTION_POLICY.md](./DATA_RETENTION_POLICY.md)
  and require legal/product approval before production.
- Release 1 is text-only for AI interviews; media consent and WebRTC remain
  future-scope design work.
