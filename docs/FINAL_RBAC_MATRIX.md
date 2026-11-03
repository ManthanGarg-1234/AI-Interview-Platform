# Final RBAC Permission Matrix

## Enforcement model

Authorization is deny-by-default and enforced in Express services. A React
route guard is UX only. Every protected request evaluates:

1. authenticated session and account status;
2. platform role;
3. company membership and company permission, when applicable;
4. resource ownership, assignment, or application scope;
5. explicit consent and its current version;
6. rate, state-transition, and suspension rules;
7. audit requirements.

`PENDING_VERIFICATION` can use only verification/resend flows. `ACTIVE` can use
authorized features. `SUSPENDED` can use only appeal/support flows. `DELETED`
has no interactive access. Admin accounts are provisioned; public admin signup
is forbidden.

## Company permissions

| Company role | Company/member management | Verification submission | Verification review/approval | Jobs | Candidates/applications | Assessments | Interviews | Hiring decisions | Analytics |
|---|---|---|---|---|---|---|---|---|---|
| `OWNER` | Invite, deactivate, change roles except final-owner removal | Submit/update evidence | Read status; cannot self-approve | Create/edit/publish/pause/close/delete eligible jobs | Full company scope | Create/edit/publish/assign | Schedule/manage/evaluate | Final decision | Full company aggregates and authorized candidate detail |
| `HIRING_MANAGER` | Read members; cannot change owner | Submit/update evidence | Read status | Create/edit/publish/pause/close | Full company scope | Create/edit/publish/assign | Schedule/manage/evaluate | Final decision if granted by company policy | Full company aggregates |
| `REVIEWER` | Read permitted members | No | Read status | Read published/company-assigned jobs | Read assigned candidates; screen; add review | Read assigned assessment results | Read assigned interview; submit evaluation | No | Assigned/aggregate analytics only |
| `INTERVIEWER` | No | No | No | Read assigned job context | Read only candidate data needed for assigned interview | Read assigned assessment summary | Join assigned interview; submit evaluation | No | No raw analytics |
| `ANALYST` | No | No | No | Read job aggregates | No raw candidate profile by default | Read aggregate outcomes | Read aggregate outcomes | No | Approved aggregate analytics only |

Rules:

- `OWNER` is the only role that can transfer ownership. A company must always
  have exactly one active owner; ownership transfer and final-owner removal are
  transactional and cannot leave zero owners.
- No member may grant a role above their own authority. An owner may not remove
  themselves unless another active owner exists after the transaction.
- Deactivating a member revokes their company-scoped sessions/claims and all
  uncompleted assignments immediately.
- Company verification submission is a recruiter owner/hiring-manager action.
  Review and approval/rejection are admin-only actions. The submitting recruiter
  cannot approve the company.

## Platform resource matrix

`Own` means the user's own record. `Company` means active company membership
plus the company permission table above. `Consent` means a current,
purpose-specific consent or an application relationship that legally requires
the minimum data.

| API module/resource | Student | Recruiter | Admin | Required condition |
|---|---|---|---|---|
| `/auth` | Own login/logout/recovery | Own login/logout/recovery | Provisioned login/logout/recovery | Verification, rate limits, CSRF, session state |
| `/users/me` | Read/update own non-role fields | Read/update own non-role fields | Read/update own non-role fields | Role/status cannot be client-edited |
| `/users` | Denied | Denied | Read/suspend/reactivate with audit | Least-privilege admin action |
| `/students/me` | Full own profile | Denied | Support/admin scope | Own profile |
| `/students/discover` | Own visibility settings | Read only discoverable candidates | Full support scope | Student `discoverable=true` plus recruiter company scope |
| `/students/:id` | Own | Minimal profile only | Operational need | Candidate visibility and purpose check |
| `/resumes` | Create/update/delete own | Read selected version only | Support/moderation scope | `RESUME_SHARING` consent or active application snapshot |
| `/skills` | Manage own self-declared evidence | Add recruiter verification only in authorized workflow | Manage taxonomy/verification | Evidence source and actor required |
| `/companies` | Denied | Company-scoped CRUD | Verify/suspend/manage | Active membership |
| `/companies/:id/members` | Denied | Owner/Hiring Manager according to action | Full audited admin scope | Company scope; final-owner protection |
| `/companies/:id/verification` | Denied | Owner/Hiring Manager submit/read | Review/approve/reject | Submitter cannot approve |
| `/jobs` | Read published/apply | Company create/update/publish/manage | Moderate/manage | Company permission and job state |
| `/applications` | Create/read/update own withdrawal | Company read/manage | Full audited scope | Candidate owns application; recruiter company scope |
| `/applications/:id/stage` | Denied | Hiring Manager/Owner; Reviewer may screen only | Admin override with reason | Allowed transition graph and audit |
| `/applications/:id/notes` | Denied private notes | Company authorized note access | Audited support scope | Private notes never exposed to candidate |
| `/assessments` | Read published/assigned | Company create/manage | Full content moderation | Ownership, assignment, publication state |
| `/assessment-attempts` | Own assigned attempt | No raw answers | Audited support scope | Assignment, timer, max attempts |
| `/assessment-results` | Own | Authorized assignment summary | Operational scope | `ASSESSMENT_SHARING` or assignment context |
| `/coding/problems` | Read published | Read assigned/public | Manage content | Publication status |
| `/coding/submissions` | Create/read own | Read assigned assessment scope only | Audited support scope | Mode restrictions and ownership |
| `/interviews` | Own participant sessions | Company-assigned sessions | Operational/support scope | Participant assignment and consent |
| `/interviews/:id/evaluation` | Read own published evaluation | Submit/read authorized evaluation | Audit/support scope | Private reviewer notes restricted |
| `/learning` | Read/update own progress | Read published content only | Manage content | Published content |
| `/study-planner` | Full own plan; approve own recommendations | Denied | Support/config scope | Student approval for major changes |
| `/ai/conversations` | Own create/read/delete | Denied | Restricted support read | Conversation owner; audited exception |
| `/ai/interviews` | Own configure/participate | Assigned recruiter context only | Support/config scope | Session participant and consent |
| `/analytics/student` | Own | Denied | Support/aggregate | Evidence and insufficient-data rules |
| `/analytics/recruiter` | Denied | Company aggregates/authorized candidate summaries | Full aggregate | Company scope; no unauthorized raw data |
| `/analytics/admin` | Denied | Denied | Full operational aggregates | Admin audit |
| `/notifications` | Own | Own | Own | Recipient ownership |
| `/consents` | Grant/revoke own | Grant/revoke own | Read/update policy only | Revocation affects future access |
| `/security-events` | Denied | Denied | Read/resolve | Sensitive admin audit |
| `/moderation` | Notice/appeal subset | Notice/appeal subset | Full workflow | AI flags require human decision |
| `/audit-logs` | Denied | Denied | Read append-only records | Admin access is itself audited |
| `/data-export` and `/data-delete` | Own request | Own request | Admin workflow | Identity verification, retention/legal hold |

## Discoverability and consent

- Student discoverability defaults to off.
- Enabling discovery exposes only the approved public profile projection:
  name, headline, location, approved skills, education summary, projects, and
  verified evidence summaries. It never exposes private contact data, AI chats,
  study activity, raw assessment answers, or private recruiter notes.
- Resume access requires `RESUME_SHARING` consent for the recruiter/company and
  selected version, or an active application whose consent snapshot names the
  selected version.
- Assessment results require `ASSESSMENT_SHARING` consent or an assignment
  created for the student's application.
- Interview text/transcript/evaluation access requires participant assignment
  and `INTERVIEW_TRANSCRIPT` consent where transcript sharing is enabled.
- Media/device/recording consent is separate and is not implied by joining a
  text interview. Revocation prevents future access and is recorded.

## Admin privileged access

Admin access is least-privilege by operation and purpose. User suspension,
role changes, company approval, moderation decisions, raw content access,
exports, policy changes, and secret/model configuration require:

- explicit permission;
- reason/purpose;
- request ID and actor/session metadata;
- before/after or decision snapshot;
- append-only `AuditLog`;
- dual review for production policy changes or severe account actions where
  configured.

Admins do not receive provider secrets, password hashes, refresh tokens, or
unnecessary raw AI prompts.

## Suspension and session revocation

Suspension transactionally sets `User.status=SUSPENDED`, `suspendedAt`,
reason/case reference, revokes all active sessions and refresh-token families,
cancels future jobs/assignments where policy requires, and emits security,
notification, and audit events. Reactivation requires an authorized admin
decision. Password reset and role/company membership changes revoke affected
sessions according to policy.

