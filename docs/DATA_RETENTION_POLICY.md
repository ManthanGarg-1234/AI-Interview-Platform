# Data Retention and Deletion Policy

## Status

The following are proposed engineering defaults, not legal retention periods.
They require product/legal approval before production. Configuration belongs in
an admin-controlled policy table with effective version and audit history.

## Proposed defaults for approval

| Data | Proposed default | Deletion behavior |
|---|---:|---|
| Active account/profile | Account lifetime | User-controlled deletion/anonymization workflow |
| Revoked sessions/tokens | 90 days | Secure purge after fraud/audit window |
| Resumes and versions | 24 months after last account activity | Delete object and metadata unless legal hold |
| Applications and hiring history | 24 months after closure | Anonymize candidate content; preserve aggregate/audit facts |
| Assessment answers/results | 24 months after completion | Delete raw answers; retain approved aggregate if permitted |
| Coding source/results | 24 months after last activity | Delete source/artifacts; retain aggregate metrics if permitted |
| AI conversations/transcripts | 12 months after last activity | Delete messages and provider references |
| AI usage/cost records | 24 months | Retain minimized operational records |
| Interview text transcripts | 12 months after completion | Delete transcript; retain consent and aggregate evaluation if permitted |
| Media/recordings (Release 2) | 30 days after completion | Delete media object and derived temporary artifacts |
| Notifications | 12 months | Purge read/expired content |
| Security events | 24 months | Restricted purge/anonymization after review |
| Moderation evidence/cases | 24 months after closure | Legal hold overrides deletion |
| Audit logs | 36 months | Append-only retention; restricted access |
| Backups | Provider-defined encrypted rotation | Expired backups securely destroyed |

## Deletion workflow

1. Authenticate and verify the request.
2. Create a deletion job and identify ownership, dependencies, consents, and
   legal/security holds.
3. Revoke sessions and signed URLs.
4. Delete or anonymize database rows according to data class.
5. Delete object-storage objects and derived artifacts.
6. Remove queued jobs and provider references where possible.
7. Record completion, exceptions, and retention-policy version in an audit log.
8. Notify the user of completed and retained categories.

Deletion is idempotent and asynchronous. It must not delete audit/security
records required to explain the deletion itself. Account deletion anonymizes
historical hiring aggregates where raw identity is no longer necessary.

## Consent

Consent records include user, type, scope, version, purpose, granted/revoked
timestamps, source, and policy version. Consent is separate for profile
discovery, resume sharing, assessment sharing, AI context, transcript, device
access, and recording. Revocation affects future processing and access.

