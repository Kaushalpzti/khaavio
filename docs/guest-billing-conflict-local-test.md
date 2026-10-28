# Guest-billing conflict migration verification (no local Docker required)

PR #11 adds a versioned migration that changes two expected guest-billing conflicts to HTTP 409. You do **not** need Docker Desktop on your Windows PC to run the SQL syntax/migration check.

## Automated PostgreSQL check

The GitHub Actions workflow starts a disposable PostgreSQL 17 service, creates a tiny compile-time fixture, applies only `supabase/migrations/20261028003935_guest_billing_conflict_http_status.sql`, and checks that both functions contain the `PT409` SQLSTATE mapping.

To see the result, open [PR #11](https://github.com/Kaushalpzti/khaavio/pull/11) and wait for **Validate guest-billing migration SQL** and **Khaavio CI** to pass. No database password, local schema dump, or Docker install is required on your PC for this CI check.

## What this check proves—and what it does not

- It proves PostgreSQL accepts the migration's DDL/function definitions in a disposable database and verifies that both HTTP 409 markers are present.
- It does not run the functions against Khaavio's complete production schema or simulate live QR orders. The functions are copied from the already-deployed guest-tabs migration and this patch only changes the SQLSTATE of the two expected conflict paths.
- Production remains unchanged until the PR is reviewed/merged and the migration is deliberately applied.

## Safety

Do not run `supabase db push`, `supabase migration repair`, or `db reset --linked` as part of this check. Do not upload a production schema dump or paste database passwords, API keys, or access tokens into chat or GitHub.

## Official references

- Supabase CLI workflows: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase `db dump` reference: https://supabase.com/docs/reference/cli/supabase-db-dump
