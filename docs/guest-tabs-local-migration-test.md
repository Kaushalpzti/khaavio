# Guest split-billing: safe local migration check (Windows)

This check runs the new guest-tab migration against a disposable local Supabase stack. It does not apply a migration to hosted Khaavio production and does not copy production rows.

## 1. Get the feature branch

Open PowerShell in C:\Users\kaush\khaavio and inspect local changes first:

~~~powershell
git status
git fetch origin
~~~

If you have no uncommitted changes and the branch does not exist locally:

~~~powershell
git switch --track origin/feat/guest-tabs-split-billing
~~~

If Git says the local branch already exists:

~~~powershell
git switch feat/guest-tabs-split-billing
git pull --ff-only
~~~

Do not discard local changes to make the switch succeed. Stop and review them first if git status is not clean.

## 2. Check prerequisites

- Docker Desktop must be installed and running.
- Run npm install from the repository root.
- Run npx supabase --version.
- If the CLI is not logged in, run npx supabase login.

## 3. Create a schema-only snapshot

The repo is missing a complete tracked base-schema migration: its current migration folder begins with changes to existing tables, and there is no supabase/seed.sql. We need a schema snapshot so the feature migration can be checked against the real table and function definitions.

Link the local CLI to the existing Khaavio project only if it is not already linked:

~~~powershell
npx supabase link --project-ref YOUR_KHAAVIO_PROJECT_REF
~~~

Get the project ref from the Khaavio project dashboard URL. The CLI may request the database password; enter it only in the terminal, never in chat or GitHub.

Then export the schema only:

~~~powershell
npx supabase db dump --linked --file supabase/local-schema-baseline.sql
~~~

Important:
- This is a schema-only db dump; do not add --data-only.
- db dump reads the hosted schema and writes a local file. It does not apply migrations.
- .gitignore excludes supabase/local-schema-baseline.sql. Do not force-add or upload that file; it is derived from production schema and stays local.
- Do not run supabase db pull, supabase db push, supabase migration repair, or any db reset --linked command for this check. We intentionally avoid changing production schema or migration history.

## 4. Replay locally

From the repository root, run:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-guest-tabs-migration.ps1
~~~

The script creates a temporary Supabase config with a unique local project ID, places only the schema baseline and guest-billing migration in its temporary migration directory, starts a disposable local stack, replays the migrations with --local, then stops and removes the temporary stack.

It does not use the linked project for reset or push. A failed check leaves the hosted production schema untouched. The baseline file itself remains in supabase/local-schema-baseline.sql so you can rerun the test until you remove it.

## 5. What the result proves

PASS means PostgreSQL accepted the baseline and new migration in a disposable local stack. It does not replace end-to-end testing of actual QR orders and payments. If a SQL error appears, stop and share the error output only; never share the database password, API keys, or schema dump.

## Official references

- Supabase CLI workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- supabase db dump and db reset CLI reference: https://supabase.com/docs/reference/cli/supabase-db-dump
