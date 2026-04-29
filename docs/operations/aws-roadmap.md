# AWS infrastructure roadmap

Tracks deferred AWS-side work — things deliberately not done now because the
trigger isn't here yet, but worth doing later when it is.

## Deferred — Lock down RDS network exposure (Path 2)

**Status**: not started. Path 1 (public RDS with strong auth) is in place.

### Current state

Both `cambridgetcg-storefront` and `tcg-wholesale` RDS instances are
publicly addressable. Their security group has an explicit `0.0.0.0/0` rule
on port 5432, alongside one trusted office/laptop IP. The mitigations in
place:

- TLS-only connections (RDS enforces SSL)
- Strong random passwords on the `postgres` superuser (managed via Vercel env
  + `apps/admin/.env.local`)
- AWS RDS encryption at rest
- IAM-scoped access for the `alpha-agent` IAM user (no console access)

The remaining residual risk is password leakage. If a password leaks via env
file commit, dev-laptop loss, or third-party log capture, the entire DB is
reachable from anywhere on the Internet.

### Why deferred

For a small team without active compliance pressure (no SOC 2, PCI, or HIPAA
audit in flight), the risk is acceptable. The fix has real ongoing cost
($60–100/month for Vercel Secure Compute) and meaningful one-time effort
(database migration to a private VPC). The trigger to invest isn't present.

### Trigger conditions to revisit

Re-open this work when **any** of the below becomes true:

- A compliance audit (SOC 2, PCI-DSS, GDPR scrutiny) is on the calendar
- The customer base grows large enough that a breach blast radius warrants
  proper isolation (rough heuristic: >5,000 paying customers or >£500k ARR)
- A near-miss: brute-force attempts visible in CloudWatch, suspicious login
  patterns, or unusual outbound from RDS
- Vercel changes its egress story in a way that makes Path 2 cheaper

### Plan when revived

The Phase 0 prep work was completed and then torn down to save the
$32/month NAT-Gateway cost. Snapshots `cambridgetcg-storefront-pre-vpc-
migration-20260429-145211` and `tcg-wholesale-pre-vpc-migration-20260429-
145211` were retained as DR insurance and as the baseline for any future
VPC migration.

The full plan lives elsewhere in this commit history but the short form is:

1. **Phase 0** — Build a new private VPC `cambridge-tcg-vpc` (10.20.0.0/16,
   3 private + 3 public subnets across us-east-1a/b/c, NAT GW, RDS subnet
   group, RDS SG locked to 10.20.0.0/16). All-AWS, ~$32/month idle.
2. **Phase 1** — Enable Vercel Secure Compute on the storefront, wholesale,
   and admin Vercel projects. Capture the static egress IPs Vercel returns
   ($30–50/month per project on Pro). Add those IPs to the new RDS SG.
3. **Phase 2** — Skip if Secure Compute is sufficient. Otherwise set up
   AWS PrivateLink endpoint or Vercel ↔ AWS VPC peering for the new private
   VPC.
4. **Phase 3** — Take fresh snapshots of both production RDS instances.
5. **Phase 4** — Restore each snapshot into the new private VPC. New
   instances run in parallel with the old public ones, sync via logical
   replication during the staging period.
6. **Phase 5** — Cutover. Update Vercel `DATABASE_URL` and
   `WHOLESALE_DATABASE_URL` to the new private endpoints, redeploy.
   Production downtime ~30 seconds–2 minutes.
7. **Phase 6** — After 24–48 hours of stability on the new instances,
   terminate the old publicly-accessible ones. The `0.0.0.0/0` rule is gone
   with the old instances.

### Alternative — Path 3 (Neon migration)

If the migration ever happens, also consider migrating off RDS entirely to
Neon (or Supabase). It eliminates the network problem permanently with
better Vercel integration (preview-branch databases per deployment) and
typically lower cost than Path 2. Roughly half a day of `pg_dump` /
`pg_restore` work per database. See the conversation around 2026-04-29 for
the comparison.
