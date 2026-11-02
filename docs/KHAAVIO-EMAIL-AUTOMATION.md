# Khaavio platform email automation

This feature sends platform/account emails to the restaurant workspace owner only.
It does not send order, booking, or other restaurant-customer emails.

## Included events

| Template key | Trigger |
| --- | --- |
| `trial_started` | A 7-day trial subscription row is inserted |
| `subscription_activated` | Razorpay reports a captured INR charge for the first payment |
| `trial_ending_reminder` | A trial has 2 or 1 local calendar days remaining |
| `subscription_renewal_reminder` | An active, non-cancelled paid plan has 3 local calendar days remaining |
| `subscription_payment_issue` | A subscription changes to `past_due` |
| `subscription_renewal_successful` | A later Razorpay recurring charge is captured |
| `subscription_cancelled` | Cancellation is confirmed or period-end cancellation is marked |
| `subscription_expired` | Subscription access actually reaches its end or Razorpay completes it |

The Resend template IDs are pinned in `supabase/functions/khaavio-email-dispatch/index.ts`.
The dispatcher sends from `hello@khaavio.in` and sets replies to `billing@khaavio.in` for subscription lifecycle messages. Public support links use `support@khaavio.in`, while general website enquiries use `hello@khaavio.in`.

The dispatcher uses Resend's template send API and a deterministic idempotency key.
The database `event_key` is the durable duplicate-prevention key; Resend's key additionally
protects short-window retries.

## Data and security model

- `khaavio_email_outbox` is private (RLS enabled; no browser-role access).
- Database triggers enqueue events in the same transaction as the subscription change.
  They do not make network requests.
- The destination email is read from `auth.users.email` for `restaurants.owner_id`.
  Restaurant `contact_email` is deliberately not used: these are platform owner emails.
- The Edge Function reads `RESEND_API_KEY` and `KHAAVIO_EMAIL_DISPATCH_SECRET` from
  Edge Function secrets. Neither value belongs in Git.
- The dispatcher accepts only the custom `x-khaavio-dispatch-secret` header and has
  `verify_jwt = false` because it is invoked by Postgres Cron, not a signed-in browser.
- A claimed row is locked with a token. Failures are retried with exponential backoff;
  rows stop after the configured maximum and become `dead` for review.
- Razorpay payment emails are queued only after the existing webhook verifies the raw
  webhook signature, captured status, INR currency, and exact plan amount.
- Manual offline/UTR renewal approvals are not yet wired to these templates. In
  particular, never pass an offline UTR into a template labelled as a Razorpay payment ID.

## Apply and configure (do not skip review)

1. Review this branch and its tests. Do not deploy directly from the feature branch.
2. Apply the migration to a staging Supabase project first. The migration enables
   `pg_cron` and `pg_net`, creates the private outbox and RPCs, and adds subscription
   triggers. It does not create a scheduled job by itself.
3. Confirm `RESEND_API_KEY` is present in Supabase Edge Function secrets.
4. Generate a separate dispatch secret in PowerShell (do not send it in chat):

   ```powershell
   $bytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   $rng.Dispose()
   $env:KHAAVIO_EMAIL_DISPATCH_SECRET = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
   npx supabase secrets set KHAAVIO_EMAIL_DISPATCH_SECRET="$env:KHAAVIO_EMAIL_DISPATCH_SECRET" --project-ref xkjcgugxdochymywzbpx
   ```

5. In the Supabase SQL Editor, store the project URL and the same dispatch secret in Vault.
   Replace only the placeholder with the secret generated in PowerShell:

   ```sql
   select vault.create_secret(
     'https://xkjcgugxdochymywzbpx.supabase.co',
     'khaavio_project_url'
   );

   select vault.create_secret(
     'PASTE_THE_GENERATED_DISPATCH_SECRET_HERE',
     'khaavio_email_dispatch_secret'
   );
   ```

   Do not paste the secret into GitHub, source files, or this chat. Vault values are encrypted.
   The `pg_net` request queue temporarily contains request headers while an HTTP request is
   waiting to be sent, so keep database access restricted.

6. After the migration and both Vault secrets are present, create the one-minute job:

   ```sql
   select cron.schedule(
     'khaavio-platform-email-dispatch',
     '* * * * *',
     $job$
       select net.http_post(
         url := (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'khaavio_project_url'
         ) || '/functions/v1/khaavio-email-dispatch',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-khaavio-dispatch-secret', (
             select decrypted_secret
             from vault.decrypted_secrets
             where name = 'khaavio_email_dispatch_secret'
           )
         ),
         body := '{}'::jsonb,
         timeout_milliseconds := 30000
       );
     $job$
   );
   ```

7. Confirm the job exists in `cron.job` and review recent HTTP results in
   `net._http_response`. Check Edge Function logs and the outbox for delivery outcomes.
8. Run the staging test matrix below before considering production.

## Staging test matrix

- Insert a test restaurant/owner and confirm exactly one `trial_started` outbox row.
- Invoke the dispatcher and confirm the test owner receives the trial email.
- Invoke the dispatcher again and confirm no duplicate is sent.
- Test day-2 and day-1 trial reminders by adjusting only staging fixture dates.
- Test a captured Razorpay webhook fixture and confirm activation; a subsequent captured
  payment should use renewal-successful.
- Test `past_due`, period-end cancellation, immediate cancellation, and expiration.
- Confirm cancelled subscriptions are excluded from renewal reminders.
- Force a Resend failure and confirm backoff/retry and eventual `dead` status work.
- Confirm no email is ever sent to restaurant customer/contact addresses.

## Operational queries

```sql
select status, template_key, count(*)
from public.khaavio_email_outbox
group by status, template_key
order by template_key, status;

select id, event_key, template_key, recipient_email, status,
       attempt_count, next_attempt_at, resend_email_id, last_error, created_at, sent_at
from public.khaavio_email_outbox
order by created_at desc
limit 100;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'khaavio-platform-email-dispatch';

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 50;
```

## Not included

- Manual/offline renewal approvals do not send an activation or renewal receipt email yet.
- The general `Khaavio Welcome Email` template is intentionally outside this transactional
  event map; `Trial Started` is the onboarding message.
- The three Supabase Auth custom emails remain managed by Supabase Auth SMTP and are unchanged.
