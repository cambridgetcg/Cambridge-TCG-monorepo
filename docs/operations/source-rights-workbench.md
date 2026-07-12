# Source-rights workbench operations

The workbench at `/admin/system/source-rights` records review proposals. It does
not grant permission and it is not a legal switchboard.

## Authority boundary

The effective source policy is the `SourceMeta.rights` object deployed from
`@cambridge-tcg/data-ingest`. Runtime fetch, storage, display and redistribution
gates read that deployed registry only.

Rows in `source_rights_review_versions` and `source_rights_review_cells` are
append-only proposals. There is deliberately no activation endpoint and no
database override. A proposal becomes effective only when a reviewed code
change updates the registry, passes `pnpm audit:tributaries`, is merged and is
deployed.

`landed` is an observation that a named commit was deployed. It is not itself
the act that makes a policy effective.

## What may be recorded

- Proposed exact field paths such as `card.name` or `card.image_url`. The
  workbench verifies shape, not membership in a canonical source schema;
  wildcards and array selectors are refused.
- One named purpose and one conclusion per cell.
- Plain-language conditions, attribution and retention limits.
- Public first-party HTTPS evidence links and the date each was reviewed.
- An opaque internal agreement-register reference, if one exists.

Never paste credentials, access tokens, signed URLs, HTTP headers, contract
files, private correspondence, personal email addresses or fetched evidence
bytes into the workbench. The URL validator rejects credentials and common
secret-shaped query parameters, but the operator remains responsible for the
material they submit.

## Review path

1. Open the deployed source record and read every existing evidence link.
2. Record a draft with exact field-and-purpose cells. Missing cells mean
   `unknown`; do not use a wildcard to imply a broad grant.
3. Export the deterministic JSON artifact. Its SHA-256 revision hash is the
   review identity.
4. Submit the draft for review. Submission appends a successor row; it does not
   mutate the draft.
5. Translate the reviewed conclusions into a normal code change. Conditional
   language needs an enforceable checker before it can become a machine permit.
6. Run the source-rights and tributaries tests, review the diff, merge and
   deploy.
7. Optionally record the full deployed commit SHA as an operator-asserted
   `landed` observation. The workbench does not independently verify deployment.

Submission and landing are refused after `valid_until` or when the deployed
registry hash has drifted from the draft's base. Reject the stale row with a
reason, then record a fresh draft.

Rejecting and landing also append successor revisions. A revision may have one
successor only, which keeps the history a line rather than an ambiguous branch.
The database enforces one root, one successor, valid successor states, and
content immutability. A new draft is available only after the current review is
rejected or recorded as landed.

## Failure behaviour

If migration `0122_source_rights_workbench.sql` is absent or the proposal
database is unavailable, the admin page still shows the deployed registry and
renders proposal values as `—`. Proposal writes return `503` and claim no
receipt. Runtime source policy is unchanged.

The APIs are admin-authenticated and no-store. Public `/api/v1/sources` routes
never read proposal tables and never expose opaque agreement references.

## Retention and people

The review artifact is intended to remain as an institutional audit record.
The acting account id is not part of the artifact and is not public. It is
eligible for redaction after 180 days through the privacy-retention sweep; an
account deletion clears it earlier through the foreign key. The evidence,
conclusions, revision hashes and timestamps remain after actor redaction.
Source-rights routes deliberately do not copy the actor or email into the
general admin action log: this append-only ledger is the audit record, and its
single actor reference has the stated 180-day redaction path.

## Release gate

Apply migration 0122 only after the normal database snapshot and rollback
checks. Applying the migration is safe with respect to runtime permissions: it
creates a proposal ledger only. It still needs explicit release approval
because it changes production schema.
