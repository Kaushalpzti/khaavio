# Guest-billing conflict migration: safe local check (Windows)

This check validates PR #11's SQL migration against a disposable local Supabase stack. It does **not** apply a migration to hosted Khaavio production and does not copy production rows.

## 1. Switch to the review branch

Open PowerShell in `C:\Users\kaush\khaavio` and inspect local changes first:

```powershell
git status
git fetch origin
```

If you have no uncommitted changes and the branch does not exist locally:

```powershell
git switch --track origin/fix/guest-billing-conflict-http-status
```

If Git says the local branch already exists:

```powershell
git switch fix/guest-billing-conflict-http-status
git pull --ff-only
```

Do not discard local changes to make the switch succeed. Stop and review them first if `git status` is not clean.

## 2. Check prerequisites

- Docker Desktop must be installed and running.
- From the repository root, run `npm install` if dependencies are not installed.
- Run `npx supabase --version`.

## 3. Create or refresh a schema-only baseline

The test needs the current deployed schema so the existing guest-billing functions and tables are present when the new migration replaces two function definitions. If the local baseline already exists but may be stale, refresh it. The command below reads schema only; it does not push or apply a migration:

```powershell
npx supabase link --project-ref xkjcgugxdochymywzbpx
npx supabase db dump --linked --file supabase/local-schema-baseline.sql
```

Important:
- If the project is already linked, do not re-link it unnecessarily.
- This dump is schema-only. Do not add `--data-only`.
- If the CLI asks for the database password, enter it only in the terminal. Never paste it into chat or GitHub.
- `.gitignore` excludes `supabase/local-schema-baseline.sql`; do not force-add or upload it.
- Do **not** run `supabase db push`, `supabase migration repair`, or any `db reset --linked` command for this check.

## 4. Replay the migration locally

From the repository root, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-guest-billing-conflict-migration.ps1
```

The script creates a temporary Supabase workspace with a unique local project ID, copies the schema-only baseline and only PR #11's conflict-status migration into its migration directory, starts a disposable local stack, replays with `supabase db reset --local --yes`, and stops/removes the temporary stack.

The script does not reset, push to, or modify the linked hosted project. The baseline stays local so the test can be rerun.

## 5. Expected result

A successful check prints a `PASS` message confirming PostgreSQL accepted the new migration against the current schema in the disposable local database. This SQL replay check does not replace the later production acceptance tests for QR ordering and billing.

If the test fails, share the SQL error output only—never share a database password, API keys, access tokens, or the schema dump.

## References

- Supabase CLI workflows: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase `db dump` reference: https://supabase.com/docs/reference/cli/supabase-db-dump
