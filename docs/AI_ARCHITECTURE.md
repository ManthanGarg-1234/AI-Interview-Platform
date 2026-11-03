# AI Architecture

## Release 1 scope

Release 1 includes:

- persistent student chatbot
- text AI interviewer
- resume analyzer
- profile enhancer
- AI usage tracking and admin model configuration

Voice, speech-to-text, text-to-speech, and video are Release 2 capabilities.

## Provider abstraction

The backend owns all provider credentials and exposes a provider-neutral
interface:

```text
generate(request: GenerationRequest): Promise<GenerationResponse>
stream(request: GenerationRequest): AsyncIterable<GenerationEvent>
moderate(input): Promise<ModerationResult>
estimateCost(request): CostEstimate
```

`GenerationRequest` contains `feature`, `modelAlias`, `messages`, bounded
`authorizedContext`, `temperature`, `maxOutputTokens`, `requestId`, and
`promptVersion`. It never accepts arbitrary system prompts or unrestricted
database content from the client.

`GenerationResponse` contains provider-neutral text/structured output, provider
request ID, model alias, prompt version, input/output token counts, estimated
cost, finish reason, safety result, and timestamp. Raw provider responses are
redacted before persistence.

Initial provider selection is an external LLM API. The adapter must support a
future second provider without changing feature services.

## Context isolation

- Chatbot context is limited to the student's selected subject/topic and
  explicitly permitted profile/learning data.
- Resume/profile features receive only the uploaded document and user-approved
  profile fields.
- AI interviewer receives only interview configuration, prior answers in that
  session, and approved rubric context.
- Recruiter/admin data is never added to a student prompt.
- Untrusted document text is marked as data, not instructions.
- Retrieved context is capped by tokens and classified by sensitivity.

## Prompt and output controls

- Prompt templates are versioned records with owner, feature, model alias,
  allowed variables, and active/revoked status.
- Validate structured outputs against Zod schemas.
- Run input/output safety checks and refuse unsafe or unauthorized requests.
- Suggestions are drafts; students must approve profile changes.
- AI scores are advisory and show evidence/limitations; they do not establish
  misconduct or verified qualifications.

## Rate and cost controls

Apply per-user, per-role, per-feature, and global limits using Redis. Enforce
daily token budgets, request size, output size, concurrency, timeout, retry,
provider circuit-breaker, and admin-configured cost ceilings. A request is
rejected or queued when budget is exhausted; it is never silently downgraded.

## Streaming

Release 1 uses Server-Sent Events for text streaming over authenticated HTTP.
The server validates the conversation/session before opening the stream and
persists the final assistant message only after completion. Disconnects cancel
provider work where supported. Socket.IO remains reserved for future interview
presence/signaling.

## Failure handling

Provider timeout, quota, safety refusal, malformed output, and upstream errors
map to explicit user-safe error codes. Retries are limited to idempotent
transient failures with exponential backoff. Every request records status,
latency, usage, and cost without storing secrets.

