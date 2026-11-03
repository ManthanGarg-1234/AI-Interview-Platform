# AI Architecture

## Scope and service boundaries

Release 1 includes four separate feature services behind one provider-neutral
integration layer:

1. **ChatbotService**: owns student conversations, subject/topic context,
   message authorization, streaming, and conversation retention.
2. **AIInterviewerService**: owns interview configuration snapshots, question
   progression, follow-ups, rubric evaluation, and interview consent.
3. **ResumeAnalyzerService**: owns upload handoff, malware-scan status, parsing,
   structured findings, and analysis usage records.
4. **ProfileEnhancerService**: converts approved resume/profile inputs into
   editable suggestions; it never writes a student profile automatically.

`AIProviderGateway` is the only component allowed to call an external LLM.
Feature services cannot access provider SDKs or secrets directly.

## Provider and secret contract

Provider credentials are stored as secret-manager references, not plaintext
database fields or environment values exposed to the frontend. A configuration
record stores `provider`, `modelAlias`, limits, pricing version, and
`secretRef`; a backend secret manager resolves `secretRef` at request time.
Secrets are never logged, returned by APIs, or placed in prompts.

```text
generate(request, abortSignal): Promise<GenerationResponse>
stream(request, abortSignal): AsyncIterable<GenerationEvent>
moderate(input, abortSignal): Promise<ModerationResult>
estimateCost(usage, pricingVersion): CostEstimate
```

`GenerationRequest` is server-constructed and contains feature, model alias,
server prompt version, allowed messages, bounded authorized context, request
ID/idempotency key, temperature, and output limit. The browser cannot provide a
system prompt, provider name, model credentials, or unrestricted context.

## Message authorization and prompt safety

Allowed external roles are only `user` and `assistant`; `system`, `developer`,
tool instructions, and provider-specific control messages are server-owned.
Chatbot conversation ownership is `AIConversation.userId`. Every read, append,
delete, stream, and regenerate operation requires that owner; admin support
access is a separately audited, minimum-necessary exception.

System prompts are versioned, immutable published templates. User text and
uploaded document text are untrusted data delimited as data, never concatenated
into instructions. Controls include:

- context allowlists by feature and sensitivity;
- size/token caps and field-level redaction;
- prompt-injection classification and instruction stripping;
- no tool/database action from model output without a server-side allowlisted
  command and authorization check;
- output moderation and schema validation;
- refusal for requests outside feature scope or unauthorized user data;
- no direct profile, hiring, moderation, or permission mutations from AI output.

Uploaded resumes are stored privately, scanned for malware before parsing, parsed
in a resource-limited worker, and converted to plain extracted text. Macros,
embedded scripts, active content, and untrusted instructions are discarded.
Parser output is treated as untrusted data and is never used as a system prompt.

## Chatbot contract

`POST /api/v1/ai/conversations/:id/messages` accepts only validated user text,
subject/topic, and an idempotency key. The server verifies ownership, loads the
conversation, applies retention/quota limits, constructs authorized context,
and creates one user message. A retry with the same idempotency key returns the
same result and cannot duplicate the message.

Streaming uses authenticated SSE. The stream emits `started`, bounded `delta`,
`usage`, `completed`, or `error` events. If interrupted, the server marks the
assistant message `PARTIAL` or discards it according to the policy; the client
can resume using the message/request ID, never by replaying arbitrary prompt
roles. Provider cancellation is sent through `AbortSignal` on client disconnect,
timeout, quota exhaustion, or shutdown.

## AI interviewer progression

The server stores a question-plan snapshot and current sequence. Progression:

1. validate configuration and create `QUESTION_GENERATING`;
2. select/generate the next question using the pinned prompt/rubric version;
3. present exactly one question;
4. persist the answer with server timestamp and answer number;
5. classify answer completeness/correctness using bounded structured output;
6. choose the configured next topic or one bounded follow-up;
7. prevent loops, duplicate questions, and question-count/time overruns;
8. queue final evaluation after completion.

Follow-ups are selected only from server-owned templates and session context.
They cannot introduce recruiter/admin/private data.

## Versioned evaluation rubrics

Rubrics are immutable versioned records containing categories, scoring anchors,
minimum evidence, insufficient-data behavior, prompt version, and publication
status. Evaluation stores the rubric version, category scores, evidence
references, model/provider usage, and safety result. A score without sufficient
evidence is `INSUFFICIENT_EVIDENCE`, not a guessed score. Evaluations are
advisory and cannot independently decide hiring, misconduct, skill verification,
or profile changes.

## Usage, cost, retries, and cancellation

Every request has request ID, idempotency key, feature, user, provider request
ID, prompt version, model alias, input tokens, output tokens, cached tokens,
latency, status, and pricing version. After completion, a reconciliation worker
compares provider-reported usage with local estimates and records actual cost;
discrepancies are flagged rather than silently overwritten.

Limits include per-user/role/feature rate limits, concurrency, daily token
budget, output size, and global cost ceiling. Transient timeouts receive bounded
exponential retries only before visible output begins and only when idempotency
is safe. Safety refusals, validation errors, quota exhaustion, and cancellation
are not retried. Requests time out, emit explicit error codes, and never
silently downgrade to a fake response.

## Retention and deletion

Chat messages, transcripts, resume analysis text, profile suggestions, and
provider references use the configurable AI/data-retention policy. Deletion is
ownership-checked, asynchronous, idempotent, removes object/parser artifacts,
revokes active streams, and preserves only minimized audit/usage records required
by the approved retention policy or legal hold.

