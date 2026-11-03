# Cross-Portal Data Access Policy

## Principles

Data access is purpose-limited, consent-aware, company-scoped, and revocable for
future access. A recruiter never receives a student's unrestricted account,
private AI conversations, private study data, or unrelated assessment content.
An admin's broad operational authority is still logged, minimized, and subject
to separation-of-duties review.

## Student-controlled visibility

Students control:

- profile discoverability by recruiters
- resume sharing and selected resume version
- project, experience, certification, and skill visibility
- assessment/interview summary sharing where the feature supports consent
- interview transcript/recording consent
- AI context inclusion preferences
- application-specific sharing, which may be required to apply to a job

Revocation prevents new access but does not retroactively erase data already
required for an active application, audit, dispute, or legal hold. The user must
be informed of such exceptions.

## Data visibility matrix

| Data category | Student | Recruiter | Admin | Default |
|---|---|---|---|---|
| Account identity/contact | Own full | Minimal when application/consent permits | Operational need | Private |
| Public profile fields | Own | Consent/application scope | Operational need | Private |
| Resume | Own versions | Selected shared version only | Support/moderation need | Private |
| Skills | Own with evidence state | Shared profile/application scope | Full operational need | Private |
| Coding submissions | Own | Assigned assessment scope or aggregate result | Security/support need | Private |
| Assessment answers | Own | Never raw by default; result summary only | Moderation/support need | Private |
| Assessment results | Own | Authorized assignment/application summary | Operational need | Private |
| AI chats | Own | Never | Restricted support/safety access | Private |
| AI interview transcript | Own | Assigned interview participants if consented | Restricted support need | Private |
| Study plan/activity | Own | Never raw; only student-approved evidence | Aggregate operational need | Private |
| Applications | Own | Company members for their jobs | Operational need | Application-scoped |
| Recruiter private notes | Never | Authorized company members | Audit/investigation need | Restricted |
| Moderation case | Notice/appeal subset | Notice/appeal subset | Full case scope | Restricted |
| Audit/security records | Never | Never | Authorized admins | Restricted |

## Cross-portal workflow

1. Student creates or updates profile and sharing settings.
2. Recruiter views only published jobs and consent-compatible candidate data.
3. Student applies; the application captures the resume version and consent
   snapshot used for that application.
4. Recruiter may move the application through permitted stages and assign an
   assessment/interview.
5. Student completes the assigned activity; the recruiter receives only the
   configured result/summary.
6. Admin receives audit events and aggregate operational data; raw content is
   accessed only for a documented support, security, moderation, or legal need.
7. Notifications are generated from domain events and contain no sensitive
   content beyond what the recipient is authorized to see.

## Access logging

Log actor, subject, resource type/id, action, purpose/context, consent version,
decision, timestamp, request ID, and source IP/device metadata subject to
privacy policy. Do not place resume text, passwords, tokens, full AI prompts, or
source code in general logs.

