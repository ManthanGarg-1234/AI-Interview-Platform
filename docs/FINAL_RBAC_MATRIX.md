# Final RBAC Permission Matrix

## Authorization model

Authorization is deny-by-default and enforced in Express services, not only in
React route guards. Every request has an authenticated user, session status,
role, resource owner/company scope, consent scope where applicable, and audit
context.

Roles:

- `STUDENT`: owns their profile, learning, submissions, applications, and AI data.
- `RECRUITER`: acts only through an active `CompanyMember` relationship and its
  company permissions.
- `ADMIN`: platform operator with explicit privileged actions and audit logging.
- `SYSTEM`: internal workers only; no interactive login or user-facing access.

Account states `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, and `DELETED` are
checked before authorization. Suspended/deleted accounts cannot use protected
features. Admin access is provisioned, never self-registered.

## Resource/action matrix

Legend: `Y` allowed subject to ownership/scope rules; `O` allowed only for
specific resources or consent; `A` admin-only; `N` denied.

| Resource | Action | Student | Recruiter | Admin | Ownership/scope rule |
|---|---|---:|---:|---:|---|
| Own account | read/update | Y | Y | Y | Own user only; role cannot be self-edited |
| Authentication | login/logout/recovery | Y | Y | Y | Verification, rate limits, and session rules apply |
| User directory | read | N | N | A | Minimum necessary fields; audit export |
| Student profile | read/update | Y | O | A | Student owns; recruiter only after visibility/consent and legitimate company context |
| Student evidence | create/update | Y | O | A | Student creates self-declared evidence; recruiter adds verification only in authorized workflow |
| Resume | create/update/delete | Y | N | A | Student owns; deletion subject to retention/legal hold |
| Resume | read | Y | O | A | Recruiter requires active application or explicit sharing consent |
| Company | create/update | N | Y | A | Recruiter must be company member; verification changes are admin-controlled |
| Company members | invite/remove/read | N | O | A | Company owner/admin member only; cannot remove final owner |
| Company verification | submit/read/decide | N | O/A | A | Recruiter submits; admin decides |
| Job | browse/read | Y | O | A | Published jobs public; drafts company-scoped |
| Job | create/update/publish/pause/close | N | O | A | Recruiter company membership and job permission required |
| Application | create/read own | Y | N | A | One active application per student/job unless policy permits |
| Application | read/manage | N | O | A | Recruiter company scope; candidate consent/authorized application context |
| Application stage | transition | N | O | A | Allowed transition graph and recruiter permission |
| Recruiter note | create/read/update/delete | N | O | A | Company-scoped; candidate cannot read private notes |
| Assessment content | browse | Y | O | A | Published content or assigned content |
| Assessment | create/update/publish | N | O | A | Recruiter company scope; admin may moderate |
| Assessment attempt | create/answer/submit/read own | Y | N | A | Assignment, time, attempt count, and server state |
| Assessment result | read | Y | O | A | Student own result; recruiter only authorized assignment/application summary |
| Coding problem | read | Y | O | A | Published/problem assignment visibility |
| Code submission | create/read own | Y | O | A | Student owns; recruiter sees only assigned assessment result/submission policy |
| Execution result | read | Y | O | A | Same scope as submission; hidden tests never exposed |
| AI conversation | create/read/update/delete own | Y | N | O | Admin support access requires audit and minimum necessary scope |
| AI usage/configuration | read usage own | Y | N | A | Provider keys/config never exposed to client |
| AI interview | configure/participate own | Y | O | A | Recruiter only for assigned interview; text-only Release 1 |
| Interview evaluation | read own/assigned | Y | O | A | Participant and authorized recruiter; private reviewer notes restricted |
| Learning content | read/progress | Y | O | A | Published content; admin manages content |
| Study planner | create/update/approve own | Y | N | A | Student approves major schedule changes |
| Analytics | read own | Y | O | A | Recruiter gets company-scoped aggregates/candidate authorized summaries |
| Notifications | read/update own | Y | Y | Y | User-owned read state |
| Moderation case | read/respond | O | O | A | Subject sees permitted notice/appeal data only |
| Moderation evidence | submit/read | O | O | A | Evidence access restricted by case role and audit |
| Security events | read | N | N | A | Admin least privilege; sensitive fields redacted |
| Audit logs | read | N | N | A | Append-only; privileged access itself audited |
| Consent records | create/revoke own | Y | Y | A | Revocation affects future access; legal hold handled separately |
| Data export/delete | request own | Y | Y | A | Identity verification, retention/legal-hold checks |

## Recruiter company permissions

`OWNER` can manage company membership and all company workflows. `HIRING_MANAGER`
can manage jobs, applications, interviews, assessments, and decisions. `REVIEWER`
can read assigned candidates and add evaluations but cannot publish jobs, manage
members, or make final decisions. `INTERVIEWER` can access assigned interviews
and submit evaluations only. `ANALYST` can read approved aggregate analytics
without raw candidate content.

Company permissions are additive but never exceed the user's platform role,
candidate consent, or resource assignment.

## Authorization enforcement

1. Authenticate session and reject invalid, expired, revoked, suspended, or
   deleted sessions.
2. Resolve role and company membership from the database, never from client data.
3. Load the resource with an ownership/company/assignment predicate.
4. Evaluate action permission and consent.
5. Record sensitive reads, writes, exports, and denials in `AuditLog`.
6. Return indistinguishable `404` responses where revealing resource existence
   would leak private data.

