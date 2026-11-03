# Final Architecture Review

## Executive summary

The planning package gives a strong high-level migration direction and correctly identifies the main problem: the existing project is a prototype built with HTML, CSS, and vanilla JavaScript, and it must be transformed into a secure, production-oriented platform with separate student, recruiter, and admin experiences. The documents cover the major business domains and the migration path in a credible way.

However, the documentation is not yet complete enough to start implementation without additional design decisions and a stricter architecture contract. The current documents are strong on scope and sequencing, but still conceptual in several critical areas: RBAC enforcement, AI architecture contracts, secure code execution, Prisma schema completeness, and end-to-end portal integration contracts.

Overall verdict:
- Good foundation for migration planning.
- Good coverage of business scope.
- Insufficient final implementation specificity in a few critical technical areas.
- Not yet ready for implementation without user approval on key architecture decisions.

## 1. Requirements coverage

### Covered well

The documents cover the major requirements from the master prompt:

- Three portal model: student, recruiter, and admin.
- Public website and login/signup flow.
- Student profile, resume, interview, coding, assessment, and learning areas.
- Recruiter job management, applications, candidate evaluation, interviews, and hiring pipeline.
- Admin oversight, moderation, audit, and security monitoring.
- Database model groups for identity, student, recruiter, jobs, coding, assessments, interviews, learning, AI, security, and notifications.
- Target stack and migration goals.
- Security and testing strategy.
- Dependency and infrastructure planning.
- Branch backup and baseline capture.

### Coverage gaps

The following items are not yet fully specified enough for implementation:

1. Final role-permission matrix
   - The docs describe roles but do not yet define a complete permission matrix for each API route, resource type, and user state.
   - There is no table mapping: role + action + resource + allowed unless explicit grant.

2. Cross-portal data ownership rules
   - The student/recruiter/admin workflows are described separately, but not all shared data ownership and consent boundaries are formally defined.
   - Example: recruiter access to student profile data, resume access, candidate assessment summaries, interview notes, and consent records need explicit rules.

3. AI architecture contract details
   - The docs state there will be AI features but do not define the complete request/response contract, prompt isolation, provider fallback, usage budgeting, or rate limiting.

4. Secure code execution and sandbox design
   - The docs rightly call for isolated execution, but they do not yet specify the exact execution architecture: containerized worker, sandbox runtime, network constraints, language limits, file mounting, artifact retention, and worker queue format.

5. Real-time interview architecture
   - The docs mention WebRTC and signaling, but the real-time architecture remains high-level and incomplete.
   - There is no finalized signaling flow, TURN configuration, consent handling, media-state lifecycle, or recording restrictions.

6. Final API contract granularity
   - The API specification enumerates resources, but it is not a complete, implementation-ready contract set with all schema definitions, pagination semantics, filtering rules, and state transitions specified.

7. Data retention and deletion flows
   - Privacy, consent, moderation, and data retention are mentioned but not yet fully modeled with concrete data retention timelines or deletion/offboarding logic.

### Overall assessment of coverage

Coverage is broad and conceptually strong, but not yet implementation-ready in all the highest-risk areas. This is acceptable in a planning phase, but not yet sufficient for direct production implementation.

## 2. Portal completeness review

### Student portal

The student portal is the strongest and most complete conceptually. It includes:
- profile management
- dashboard
- resume work
- AI assistant
- coding
- assessments
- learning and planner
- applications/jobs
- interviews
- analytics

Strong points:
- The lifecycle is clearly described.
- There is strong alignment with the master prompt.

However, the student portal still needs:
- complete schema for profile completion scoring and evidence weighting
- a concrete rules engine for placement readiness
- explicit definitions for what counts as verified vs self-declared skill evidence
- a shared data contract between resume analysis, AI profile enhancer, and dashboard indicators

### Recruiter portal

The recruiter portal is conceptually complete but still somewhat abstract. It includes:
- company and member management
- jobs
- candidate discovery
- application pipeline
- assessment scheduling
- interviews
- notes and decisions

Missing implementation specifics:
- candidate visibility policy by company, role, and consent
- hiring pipeline state transitions with audit logs
- stage permission rules and recruiter access restrictions
- explicit recruiter/company authorization model across company members

### Admin portal

The admin portal is covered at a high level with strong scope, but is not yet concrete enough. It includes:
- user management
- moderation and audits
- platform security
- AI management
- analytics

Missing details:
- security event taxonomy
- moderation review workflow and evidence structure
- audit log schema and retention
- secure read-only admin dashboards with separation of duties

### Final conclusion on portal completeness

The three portals are conceptually connected and aligned to the master spec, but not yet fully operationalized. The docs are planning-grade, not implementation-grade.

## 3. Workflow connectivity between student, recruiter, and admin

### Positive signs

The architecture connects the main workflows through shared entities:
- User
- Company
- Job
- Application
- AssessmentAttempt
- InterviewSession
- Notification
- AuditLog
- ConsentRecord
- ModerationCase

This is the correct foundation for cross-portal integration.

### Missing connection contracts

The documentation does not yet specify fully:

1. Application lifecycle event flow
   - Student applies -> recruiter screens -> recruiter shortlists -> assessment assigned -> interview scheduled -> hiring decision -> admin audit.
   - This is described conceptually, but not in event schema or API state transitions.

2. Notification propagation
   - The system will need to notify students, recruiters, and admins across many actions; this is listed but not fully designed.

3. Cross-portal analytics
   - Analytics is discussed as a separate domain, but the exact data flow from coding, assessment, resume, AI interview, and recruiter decisions into a unified dashboard is not fully defined.

4. Consent-driven data sharing
   - There are no explicit rules for when a student must authorize resume sharing, candidate profile visibility, interview recordings, AI analysis, and recruiter summary generation.

### Verdict

Workflow connectivity exists at business design level, but not yet at the level of event-driven implementation contract or end-to-end data flow specification.

## 4. Database support for all required modules

### What the database design covers

The database design includes the major named entities from the master prompt, including:
- identity and sessions
- student profile and evidence
- company and recruiter data
- jobs and applications
- coding problems and execution results
- assessments and answers
- interviews and evaluations
- learning and planner
- AI conversations and usage log
- security and moderation
- notifications and consent

This is a good high-level mapping.

### Database design issues

The design is not yet sufficient as a final schema because it is still conceptual rather than implementation-ready.

#### 1. Missing concrete Prisma schema details

The docs list model names, but not the actual Prisma models with:
- enum definitions
- field-level nullability
- unique constraints
- relation names
- cascade rules
- indexes
- defaults
- composite constraints

This is a major issue because the database is central to the platform.

#### 2. Missing key workflow tables

Some important workflow tables are implied but not fully specified:
- application submission source/resume version
- stage review notes and approvals
- assessment difficulty/negative marking configuration
- AI prompt context and retrieval metadata
- interview recording consent checkpoints
- student learning path recommendations and approval states
- job matching and candidate score snapshots
- platform metric snapshots for dashboards

#### 3. Missing audit and security schema depth

The docs mention `AuditLog`, `SecurityEvent`, `ModerationCase`, and `Appeal`, but they do not yet define:
- who can read each record
- which events are recorded automatically
- how root-cause analysis is performed
- how appeal and moderation events are linked to user session state

#### 4. Missing indexes and query patterns

The docs mention indexes but do not specify which fields are critical in practice:
- user email + role
- job company + status + deadline
- application candidate + job + stage
- student skill evidence by type/verified state
- coding submission problem + user + status
- interview session candidate + recruiter + status
- AI conversation + user + session/date

#### 5. Missing media and artifact storage model

The architecture calls for object storage, but the schema does not define:
- object references
- signed URL lifecycle
- file ownership and types
- virus scanning status
- retention and deletion rules

### Verdict

The database conceptually supports the platform, but it still needs a full concrete Prisma schema with constraints, indexes, and workflow tables before implementation begins.

## 5. Prisma schema adequacy review

### What is good

The database model list is broad and well organized, and the entity groups align with the product requirements.

### What is missing

A real Prisma schema should include:

- enums for UserRole, JobStatus, ApplicationStage, InterviewMode, AssessmentType, ModerationStatus, ConsentType, AIModelName, SubmissionVerdict, etc.
- relation mappings between users and company memberships
- candidate evidence and verification states
- job matching/skills relation and score snapshots
- moderation workflow states
- notification read/archival state
- AI usage records tied to specific conversation and user actions
- code execution restrictions and environment metadata
- resume and document ownership + version references

### Additional architectural concern

The design currently treats the system as a single modular monolith, which is acceptable for phase 1, but the Prisma schema must still be designed around domain boundaries to avoid the classic monolith entanglement problem. Otherwise, implementing all modules in one large schema without clear domain boundaries may create difficult migrations.

### Verdict

The planned Prisma schema is directionally correct but not yet production-adequate. It must be expanded into a complete, validated, migration-safe Prisma design before implementation.

## 6. Authentication, login, signup, RBAC, routing, and navigation

### Strengths

The documents correctly require:
- secure password hashing
- JWT/session and refresh rotation
- protected routes
- role-aware routing
- admin-only provisioning
- server-side authorization

This is aligned with best practice and the master prompt.

### Gaps

The documents do not yet specify:
- whether access tokens are cookie-based or JWT bearer-based
- the exact refresh lifecycle and rotation behavior
- session invalidation rules across device logout, password reset, and role changes
- role-change event handling
- locked-down route configuration for every portal, including nested access rules
- how admin-only registration is provisioned in a secure environment

### Navigation plan

The route names and portal navigations are clearly described, including sidebar layouts. That is good.

### Security caveat

The route guard described in the docs is valid as a frontend UX layer, but it must never be mistaken for authorization enforcement. The API must own RBAC.

### Verdict

The auth/RBAC strategy is conceptually sound, but final implementation details must be chosen and locked before coding starts.

## 7. AI chatbot and AI interviewer architecture

### Strengths

The docs correctly define the need for:
- persistent conversation history
- context-aware responses
- role-specific constraints
- AI usage recording
- evaluation and feedback
- standard provider abstraction

### Gaps

The docs do not yet define:
- provider abstraction design (OpenAI-compatible API, Azure OpenAI, third-party provider, or multi-provider with fallback)
- prompt guardrails by role and authorized context
- rate limiting and usage quota by user role
- prompt injection protections
- moderation of AI outputs and hallucination risk controls
- streaming architecture and front-end integration contract
- storage of prompt context and message history for retrieval
- AI interviewer transcript retention and consent artifacts

### AI interviewer

The AI interviewer is described at a good business level, but it still lacks explicit architecture for:
- generated question pipeline
- evaluation rubric structure
- answer scoring model
- transcript persistence with consent records
- interviewer mode (technical, HR, behavioral, mixed)

### Verdict

AI architecture is acceptable at planning level, but it needs a concrete provider abstraction and risk controls before implementation.

## 8. Monaco IDE and secure code execution architecture

### Strengths

The planning correctly sets the direction:
- Monaco Editor for coding UI
- server-side code execution
- hidden/public tests
- mode restrictions
- judge or isolated execution worker
- Java first, then expansion carefully

### Gaps

This is one of the most critical technical areas because the platform must evaluate untrusted code. The current docs do not yet sufficiently define:

1. Execution environment
   - Docker container, VM, or external provider?
   - Must be isolated from the application server.

2. Security controls
   - no network
   - timeouts
   - memory and CPU limits
   - process limits
   - file-system isolation
   - output size limit
   - language allowlist

3. Queue model
   - immediate execution versus asynchronous worker queue
   - retry and dead-letter policy

4. Multi-language strategy
   - Java only now, then additional languages later
   - design must include language definition schema and judge adapter abstraction

5. Hidden test confidentiality
   - Should hidden tests be encrypted or stored in a protected service?

### Verdict

The secure code execution plan is directionally correct but still insufficient for production. This is a high-priority technical design gate before implementation.

## 9. Resume analyzer, profile enhancer, study planner, analytics

### Resume analyzer and profile enhancer

These are described at business level but not at implementation detail level. Missing:
- upload workflow and validation
- resume parsing strategy
- AI model usage and prompt scoping
- review/approval process before profile suggestions are applied
- consent and permission boundaries for resume parsing

### Study planner

The planner is well scoped, but still needs:
- dynamic scheduling logic
- approval flow for major schedule change
- recommendation engine input definitions
- progress/completion tracking and target-company prioritization

### Analytics and performance tracking

This is covered conceptually, but not concretely enough. Missing:
- exact formula definitions for readiness scores
- transparent metric definitions and evidence weighting
- separate “self-declared”, “inferred”, and “verified” skill state design
- analytics snapshot tables and trending calculations

### Verdict

These are promising design areas but still need more detailed data contracts and scoring logic before implementation.

## 10. Recruiter hiring workflow and admin security management

### Recruiter hiring workflow

The workflow is reasonably complete at a business level:
- job creation
- publishing
- application review
- stage transitions
- assessment assignment
- interview scheduling
- notes and evaluations
- hiring decision

Gaps:
- approval rules between stages
- audit trail model at each stage change
- candidate visibility logic by company or recruiter membership
- hiring recommendation schema and evidence management

### Admin security management

The admin domain is broad and well scoped. The main gap is operational detail: how security events become investigation workflows, what evidence is persisted, and which admin actions require dual authorization or active review.

### Verdict

Business workflows are good, but operational control rules and event schema still need to be tightened.

## 11. Migration strategy assessment

### Good migration strategy aspects

The migration plan correctly emphasizes:
- preserving existing useful behavior
- creating a backup branch
- maintaining the original files during migration
- not deleting legacy pages prematurely
- establishing the target stack before replacing the app shell
- migrating the stack in vertical slices

This is a solid migration philosophy.

### Migration risks

1. Legacy UI and business logic are tightly coupled in browser scripts.
   - This creates a high risk of re-creating a front-end-only workflow in a new framework without the necessary backend integration.

2. `localStorage` is the current “database”.
   - This must be explicitly replaced, not simply copied into React state.

3. Existing project has no formal backend domain model.
   - There is no production-like server schema or canonical data model yet.

4. Demo account and role logic is not authentic.
   - This must be fully replaced with secure identity and authorization.

5. The existing code contains global scripts and shared UI/state patterns that may be too tightly coupled for a direct component migration.
   - This should be handled through a carefully extracted feature decomposition instead of blind page conversion.

### Verdict

Migration strategy is sound but must remain incremental and evidence-based. The current plan is not a direct rewrite plan; it is a controlled modernization strategy, which is correct.

## 12. Missing dependencies and external API credentials

### Missing dependencies

At the documentation level, the missing dependencies are correctly identified. They include:
- React, React DOM, Vite
- Tailwind CSS
- React Router
- TanStack Query
- React Hook Form and Zod
- Framer Motion
- Recharts
- Lucide React
- Monaco editor integration
- Prisma and PostgreSQL client
- Redis + BullMQ
- Socket.IO
- security and auth libraries
- testing libraries

### Missing external services and credentials

The docs correctly call out the required external services:
- PostgreSQL
- Redis
- AI provider and keys
- email service
- object storage
- Judge0 or isolated execution environment
- WebRTC signaling and TURN server
- deployment/monitoring and secret management

### Important note

The review confirms no credentials or secrets should be added during this planning stage. All external credentials must be user-provided and managed outside source control.

## 13. Scalability, security, and architectural risks

### Scalability risks

- Platform ambition is large for a single-team implementation; the workload spans AI, assessments, coding, recruiting, administration, analytics, and moderation.
- The architecture must not overuse a single monolithic service without clear boundaries.
- Code execution and AI workloads can become bottlenecks if not isolated and queued.
- Analytics and recommendation calculations may be expensive if computed synchronously.

### Security risks

- AI prompt injection and unauthorized context leakage.
- Untrusted code execution is the highest-risk technical area.
- Session and refresh token implementation must be strict.
- Resume and interview data are sensitive and require strong consent and access control.
- Moderation workflows and audit logs must be tamper-resistant.
- Admin actions must be loggable and reviewable.

### Architectural risks

- The project’s current state is a prototype with browser-only state; migrating it directly without a domain model would create large rework.
- The docs are broad but still not definitive enough in every high-risk feature domain.
- Cross-portal permission logic is not yet formalized enough to avoid data leakage.
- No final schema or database migration plan is yet provided.

## 14. Existing functionality and asset preservation

### Preserved well

The current project has useful reusable assets:
- interface concepts and page structure
- role-based demo flow
- interview scoring logic concept
- job and application vocabulary
- coding problem metadata and local Java execution patterns
- styling direction and responsive patterns
- existing labelling and UX flows

### Preservation risk

The review does not see a concrete preservation strategy for the existing browser scripts beyond conceptual migration direction. This is acceptable at planning level, but a real migration should preserve the useful workflows through extraction and domain mapping rather than page-by-page rewriting.

### Verdict

Useful functionality and branding are identified and will be preserved conceptually, but the actual extraction mapping still needs design work before implementation.

## 15. Final recommended implementation sequence

The recommended order after approval is:

1. Finalize product contracts and permission matrix
   - Confirm auth model, RBAC, and route-level access rules.

2. Finalize execution and AI architecture decisions
   - Choose secure code execution architecture.
   - Choose AI provider and streaming strategy.

3. Define the concrete Prisma schema
   - Build the first migration with identity, user roles, student, recruiter, company, job, application, and audit models.

4. Implement auth and base portal shell
   - Login, signup, verification, refresh, logout, protected routes, role-aware navigation, UI shell.

5. Implement student profile and dashboard
   - Student profile, student dashboard, resume metadata, and consent model.

6. Implement coding platform backend and UI
   - Problems, submissions, execution worker, hidden tests, result persistence.

7. Implement assessments and learning planner
   - For student learning, assessment, and study-planning flows.

8. Implement recruiter workflows
   - Company management, job publishing, candidate screening, stage transitions, interview scheduling, decisions.

9. Implement AI features
   - Chatbot, AI interview, resume analyzer, and profile enhancer with provider abstraction and usage tracking.

10. Implement admin features and governance
   - Monitoring, moderation, audit, policy controls, risk review.

11. Cross-portal analytics and notification integration
   - Unified dashboards and event-driven notifications.

12. Security hardening, performance testing, and deployment readiness
   - Load testing, backup restore, code sandbox validation, and final production review.

## 16. Decisions that were pending before the approval response

These were the critical decisions identified by the original review. They are
now resolved by the approval response and the detailed documents below; the
remaining operational approvals are listed in the final section.

1. Authentication model
   - Confirm whether the system uses secure HTTP-only cookies, bearer tokens, or dual-mode access.

2. AI provider and model strategy
   - Choose the AI provider, provider abstraction, budget policy, and retention model.

3. Code execution architecture
   - Confirm whether execution uses Docker-based workers, isolated containers, a managed external judge, or a custom execution service.

4. Real-time interview architecture
   - Confirm whether live interviews are included in the initial scope and whether WebRTC signaling/TURN is part of the first release or a later milestone.

5. Data retention and consent model
   - Confirm the retention periods for resumes, recordings, transcripts, AI interactions, and moderation evidence.

6. Prisma schema approval
   - Approve the final direction for the database design before implementation begins.

7. Scope priority for first release
   - Confirm whether the first release should prioritize student authentication + profile + coding, or a broader full-stack slice including recruiter/admin workflows in the first milestone.

8. External service ownership
   - Confirm which external services you are providing, which are managed by your team, and which require third-party credentials or subscriptions.

9. Deployment target
   - Confirm whether the first implementation target is local Docker-based development only or a more production-like cloud deployment path.

10. Feature gating for v1
   - Decide which of the advanced features (voice interview, full AI interviewer, full analytics, object storage integration, full moderation workflow) are required in the first MVP versus phase 2.

## Superseded approval decisions

The user has approved the following decisions after this review:

- Secure HTTP-only cookies, short-lived access tokens, refresh rotation, session
  management, and CSRF protection.
- External LLM through a centralized backend provider abstraction.
- Judge0 first through a dedicated adapter, with a future self-hosted worker
  replacement path.
- Text AI interviews in Release 1; voice/video in Release 2.
- Configurable retention, consent, deletion, and secure storage; no invented
  legal retention periods.
- PostgreSQL/Prisma with a complete field-level schema before production
  migrations.
- A functional interconnected vertical slice across all three portals in
  Release 1.
- Docker-based local development followed by cloud deployment planning.
- Release 1 core scope: authentication, profile, coding, assessments, chatbot,
  text interviewer, planner, recruiter workflows, candidate evaluation, and
  admin governance.

The additional design package now records these decisions in:

- [FINAL_RBAC_MATRIX.md](./FINAL_RBAC_MATRIX.md)
- [DATA_ACCESS_POLICY.md](./DATA_ACCESS_POLICY.md)
- [FINAL_PRISMA_SCHEMA.md](./FINAL_PRISMA_SCHEMA.md)
- [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)
- [CODE_EXECUTION_ARCHITECTURE.md](./CODE_EXECUTION_ARCHITECTURE.md)
- [INTERVIEW_ARCHITECTURE.md](./INTERVIEW_ARCHITECTURE.md)
- [WORKFLOW_STATE_TRANSITIONS.md](./WORKFLOW_STATE_TRANSITIONS.md)
- [ANALYTICS_METRICS.md](./ANALYTICS_METRICS.md)
- [DATA_RETENTION_POLICY.md](./DATA_RETENTION_POLICY.md)
- [FINAL_IMPLEMENTATION_ROADMAP.md](./FINAL_IMPLEMENTATION_ROADMAP.md)

## Final decision

The architecture is approved in direction and detailed enough to begin the
next implementation-preparation step, but application code, dependency
installation, and migrations remain paused. Proposed retention defaults require
product/legal approval before production, and final provider/account choices
remain external configuration decisions.

## Remaining approvals

Before implementation or production setup, only these decisions remain open:

1. Product/legal approval of the proposed retention defaults, or replacement
   values and jurisdiction-specific policy.
2. Selection of the actual LLM provider/model account and budget.
3. Selection of the Judge0 endpoint/plan and credentials.
4. Email provider, object-storage provider, and cloud deployment account.
5. Docker Desktop installation/approval on the development machine.
6. Final Node.js LTS version for CI and deployment.
7. Release acceptance criteria for the first interconnected three-portal slice.
