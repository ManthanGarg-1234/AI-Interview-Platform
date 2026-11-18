# Authentication and Authorization Architecture

## Scope and current state

This document defines the unified authentication system for CareerPrepAI. The current
implementation includes backend registration, password login, Google OIDC/Firebase sign-in,
browser sessions, refresh rotation, session revocation, CSRF/origin enforcement, rate
limiting, email verification, password recovery/change, and authentication audit
events. Firebase account linking is allowed only when the existing account email is already
verified; unverified existing accounts must complete email verification first.

Identity and session handling are centralized in one user system. All authorization
decisions are made by the backend. A client-supplied role, company ID, or membership
state is never trusted.

The backend exposes `POST /api/v1/auth/register`,
`POST /api/v1/auth/register/student`, and
`POST /api/v1/auth/register/recruiter`. Registration requires `confirmPassword`, `acceptedTerms: true`, and
`acceptedPrivacyPolicy: true`; accounts remain `PENDING_VERIFICATION` and cannot sign
in until the emailed one-time verification link activates them. Verification links
carry the token in a URL fragment, which is not sent in HTTP requests or referrer
headers; the frontend removes it from browser history and submits it in a POST body.
Resend requests return a generic response and are rate-limited.

Password sign-in uses `POST /api/v1/auth/login`. Session endpoints are
`GET /auth/csrf`, `POST /auth/refresh`, `POST /auth/logout`,
`POST /auth/logout-all`, `GET /auth/sessions`,
`DELETE /auth/sessions/:sessionId`, and `GET /auth/me`, all under `/api/v1`.
Email endpoints are `POST /auth/verify-email`, `POST /auth/resend-verification`,
`POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, and the
authenticated `POST /auth/password/change`.

## Users, roles, and account state

`UserRole` is the single primary role enum: `STUDENT`, `RECRUITER`, or `ADMIN`.
`AccountStatus` tracks verification, active, suspended, and deleted states. A user has
one primary role; roles are not inferred from frontend routes or profile fields.

Email is stored for display and delivery, while `emailNormalized` stores the trimmed,
lowercase identity key and has a database unique constraint. All account lookup and
creation paths must use the same normalization rule. `fullName` and `profileImageUrl`
are optional so existing student and recruiter profiles remain compatible. Soft
deletion uses `deletedAt`; account suspension uses `status` and `suspendedAt`.

A recruiter role alone grants no access to a company's data. Every recruiter operation
must check an active, accepted `CompanyMember` for the specific company and the
required membership role. Membership role values are `OWNER`, `HIRING_MANAGER`,
`REVIEWER`, `INTERVIEWER`, and `ANALYST`. Existing `active`, `acceptedAt`, and
`deactivatedAt` fields represent membership state; invitation email, inviter, hashed
invitation token, and expiry support the invitation lifecycle. Company verification
status is checked separately from membership.

## Passwords and OAuth identities

New password hashes use Argon2id with 19 MiB memory, two iterations, and parallelism
one. Never store plaintext passwords or return hashes. Existing bcrypt hashes remain
verifiable; successful bcrypt authentication opportunistically rehashes to Argon2id.
OAuth-only users have a nullable password hash.

`OAuthAccount` stores the provider and stable provider account identifier, with a
unique constraint on `(provider, providerAccountId)`. Only Google is enabled by the
foundation. Provider access or refresh tokens are not stored because no platform
feature requires them.

Google authorization-code sign-in uses a cryptographically random state, nonce, and
PKCE S256 challenge. The state, nonce, verifier, consent flags, and short expiry are
AES-GCM encrypted in an HTTP-only, Secure-in-production, SameSite=Lax transaction
cookie scoped to the callback. Google’s `google-auth-library` exchanges the code with
the verifier and validates the ID-token signature, issuer, audience, and expiry; the
backend separately checks the nonce and requires a verified email. Provider tokens
are discarded and never stored. Callback query parameters are redacted from request
logs.

An existing Google identity is selected by the unique verified provider subject, never
by email alone. If the Google email matches an existing account, linking is allowed only when that
account has a verified email, and the link is recorded as an audit event. A new
Firebase Google account requires terms, privacy consent, and an explicit
`STUDENT` or `RECRUITER` onboarding role; the selected role creates only its
corresponding profile.

## Browser session lifecycle

Browser authentication uses Secure, HTTP-only cookies for the short-lived access
credential and opaque refresh token. Cookies use the configured `SameSite` value
(`Lax` by default), narrow paths, and production-only `Secure`. The refresh credential
is a high-entropy random value; only an HMAC-SHA-256 digest keyed with
`SESSION_TOKEN_PEPPER` is stored for new tokens. Existing SHA-256 digests are accepted
only for legacy chains, and a successful rotation replaces them with peppered hashes.
Raw refresh credentials are returned only in the cookie and never placed in JSON,
logs, analytics, or browser storage. Do not store refresh tokens in `localStorage` or
`sessionStorage`.

`UserSession` represents privacy-preserving device/browser fingerprints, a hashed
session identifier, last activity, expiry, and revocation. IP and user-agent values
are HMAC digests used only for device comparison; raw values are not logged or
persisted. `TokenFamily` represents
one login's refresh chain and links its refresh tokens; `RefreshToken` records each
hashed token, expiry, revocation, and replacement. Multiple sessions are separate
families. The initial token family, refresh token, and linked `UserSession` should be
inserted in one database transaction.

Rotation is serialized per family with a serializable database transaction and
conditional update that succeeds only when the presented token is unrevoked,
unexpired, and the family is active. Exactly one row must transition from active to
rotated before inserting its successor. The unique replacement relation and
transaction prevent concurrent requests from creating multiple valid chains. Reuse of
a rotated token revokes the family, session, and outstanding refresh tokens, and
records a security event. Account status and absolute family expiry are checked on
every refresh. Session revocation marks the session, family, and outstanding refresh
tokens revoked atomically.

## Email verification and password recovery

Email verification and password recovery use separate one-time token tables. Generate
high-entropy random tokens, deliver the raw value only through the intended link, and
store only its hash, expiry, and used timestamp. Consume a token and update the
account/password in a transaction; reject expired, already-used, or revoked tokens.
The stored token digest is an HMAC-SHA-256 value keyed with
`SESSION_TOKEN_PEPPER`. Verification links expire after 24 hours; password reset links
expire after 30 minutes. Password reset and authenticated password change revoke all
active sessions, token families, and refresh tokens. Recovery and resend responses do
not reveal whether an email address exists, and requests are rate-limited. Delivery
failures are recorded as sanitized `AUTH_EMAIL_DELIVERY_FAILED` audit events, without
recording recipient addresses, tokens, or provider response data.

The configured email adapter is an HTTP JSON endpoint: it receives a bearer-authenticated
POST with `{ "to", "subject", "text" }`. Configure `EMAIL_API_URL` and `EMAIL_API_KEY`
together; `EMAIL_PROVIDER` is an optional non-secret provider label. Missing configuration
is a `503` for registration and email-dependent workflows, never a successful
development-mode no-op. The provider endpoint and credentials must be protected by the
deployment environment and must not be logged.

## Authorization and account suspension

Backend middleware validates the credential, loads current account state, and enforces
the route's primary role. Recruiter services additionally load the requested company
membership and enforce its active/accepted state and required subrole for every
operation. Never accept role or membership elevation from request bodies.

Suspension changes the account to `SUSPENDED` and revokes sessions, token families,
and outstanding refresh tokens in the same transaction. Authentication and refresh
must reject suspended or deleted accounts. Permission changes and company membership
changes must create audit events.

## CSRF, CORS, and origin validation

For authentication endpoints and cookie-authenticated state-changing requests, require:

- A synchronizer or signed double-submit CSRF token in a request header.
- An exact `Origin` match against the configured frontend origin; when `Origin` is
  absent, validate `Referer` against the same origin or reject the request.
- `SameSite` cookies and restrictive CORS as defense in depth.

Allow only the configured frontend origin, set credentialed CORS only for that origin,
and never combine credentials with wildcard origins. Clients obtain the CSRF token
from the readable `career_csrf` cookie and echo it in `X-CSRF-Token`; it is not an
authentication credential. Registration and login remain CSRF-token exempt because no
authenticated cookie exists yet, but still require an exact trusted origin.
The Google sign-in start endpoint also requires the exact frontend origin; the
cross-origin callback is protected by the encrypted transaction cookie and verified
state, nonce, and PKCE values.

## Security audit events

Use the existing `AuditLog` and `SecurityEvent` models. Record stable action codes for
registration, login success/failure, logout, password change/reset, email verification,
OAuth login/link, account suspension, session/family revocation, and permission or
membership changes. Store only an actor/subject ID when known, request ID, event code,
resource identifiers, timestamp, and justified network metadata.

After repeated password failures, active password accounts use persistent exponential
backoff locks. Redis rate limiting remains the outer protection and unknown accounts
continue to receive generic responses. A login from an unseen IP/user-agent pair
creates a security event and sends a generic alert when email delivery is configured;
email delivery failure does not invalidate the successful login.

Audit data must be allowlisted and sanitized. Never write passwords, raw or hashed
tokens, OAuth secrets, cookie values, authorization headers, full request bodies, or
other sensitive payloads into `before`, `after`, `details`, logs, or error responses.
Keep login-failure events useful without recording submitted credentials.

## Configuration and rollout

Use `ACCESS_TOKEN_SECRET` for access-token signing and keep it outside source control.
Non-test environments require both it and `SESSION_TOKEN_PEPPER`; production requires
each to be a non-placeholder of at least 32 characters. Generate independent random
values before deployment. Configure `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`GOOGLE_OAUTH_CALLBACK_URL` together. The callback must exactly match the backend
origin and `/api/v1/auth/google/callback` route. Use exact frontend and backend
origins. Email delivery uses the provider, API URL, and API key settings described
above.

## Browser authentication E2E validation

The browser suite uses the Firebase Auth Emulator only when
`FIREBASE_AUTH_EMULATOR=true` and `VITE_FIREBASE_AUTH_EMULATOR=true` are explicitly
set. Production rejects the backend emulator flag, and the frontend ignores the
frontend emulator flag in production builds. The suite uses isolated UUID email
addresses and removes matching database users plus emulator accounts after every test.

Run locally:

```powershell
npm install
npx playwright install chromium
npm run test:e2e
```

The `test:e2e` runner starts the Auth Emulator, a test backend on port 3001, and the
frontend on port 5174, then runs Playwright serially. PostgreSQL must be available
through the configured `DATABASE_URL`. To start only the emulator for manual probing,
run `npm run firebase:emulator`.

CI should provide PostgreSQL and run `npm ci`, `npx playwright install --with-deps chromium`,
then `npm run test:e2e`. The emulator is local to the job and no real Firebase project
or Google account is used by the automated suite.

### Manual real-account Google sign-in checklist

- [ ] Use a non-production test account and confirm the account email is verified.
- [ ] Enable Google sign-in in the intended Firebase project.
- [ ] Add every deployed frontend hostname to Firebase Authentication **Authorized domains**;
      do not rely on `localhost` for production.
- [ ] Confirm the production Firebase `authDomain`, project ID, API key, app ID, and
      messaging sender ID match the deployed frontend.
- [ ] Confirm the backend Google OAuth callback, if using the authorization-code flow,
      is exactly `https://<backend-host>/api/v1/auth/google/callback` in both Google
      Cloud Console authorized redirect URIs and the application environment.
- [ ] Confirm the frontend origin is included in the backend CORS/origin allowlist.
- [ ] Sign in with Google from the production login page and verify the expected
      student/recruiter landing page.
- [ ] Verify `GET /api/v1/auth/me`, logout, cookie clearing, and re-login behavior.
- [ ] Confirm no ID tokens, refresh tokens, raw user-agent values, or raw IP values
      appear in browser storage, application logs, or audit details.
